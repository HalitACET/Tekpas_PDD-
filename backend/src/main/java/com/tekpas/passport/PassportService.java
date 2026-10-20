package com.tekpas.passport;

import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchProgress;
import com.tekpas.batch.BatchRepository;
import com.tekpas.batch.BatchService;
import com.tekpas.batch.BatchStatus;
import com.tekpas.batch.dto.BatchResponse;
import com.tekpas.batch.dto.ScoreResponse;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.company.AppUser;
import com.tekpas.company.AppUserRepository;
import com.tekpas.passport.PassportSnapshotBuilder.Built;
import com.tekpas.passport.dto.PassportDetailResponse;
import com.tekpas.passport.dto.PassportVersionResponse;
import com.tekpas.passport.snapshot.PassportSnapshot;
import com.tekpas.validation.ValidationService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Publishing, previewing, withdrawing and the versions of a batch's passport (docs/m6-plan.md §3.3). A published version
 * never changes (V11 trigger); a change is a new version and the old one becomes SUPERSEDED. Locks are taken in one
 * order everywhere, batch first and then the passport row, so that two of them cannot wait for each other.
 */
@Service
public class PassportService {

    private static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");

    private final BatchRepository batches;
    private final BatchService batchService;
    private final BatchProgress progress;
    private final PassportRepository passports;
    private final PassportSnapshotBuilder builder;
    private final AppUserRepository users;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final PublicProperties publicProperties;
    private final QrCodes qr;
    private final JobQueue jobs;
    private final ValidationService validation;

    public PassportService(BatchRepository batches, BatchService batchService, BatchProgress progress,
            PassportRepository passports, PassportSnapshotBuilder builder, AppUserRepository users, JdbcTemplate jdbc,
            ObjectMapper json, Clock clock, PublicProperties publicProperties, QrCodes qr,
            JobQueue jobs, ValidationService validation) {
        this.batches = batches;
        this.batchService = batchService;
        this.progress = progress;
        this.passports = passports;
        this.builder = builder;
        this.users = users;
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
        this.publicProperties = publicProperties;
        this.qr = qr;
        this.jobs = jobs;
        this.validation = validation;
    }

    /**
     * {@code noRollbackFor}: a refused publishing (409) still keeps what the check just found, so that the Uyarılar tab
     * shows the issues the refusal talks about. Nothing else has been written when it is refused.
     */
    @Transactional(noRollbackFor = ConflictException.class)
    public PassportVersionResponse publish(UUID companyId, UUID userId, UUID batchId) {
        Batch batch = batches.lockForUpdate(batchId, companyId).orElseThrow(PassportService::batchNotFound);
        if (batch.getStatus() == BatchStatus.PUBLISHED) {
            throw ConflictException.state("ALREADY_PUBLISHED",
                    "The batch is published; open a new version to change it");
        }
        // The rules run now, under the batch's lock: a finding left over from before cannot let a publishing through.
        validation.check(batch);
        // The score is computed here, on the server, from the data as it is now; the client's view does not count.
        ScoreResponse score = batchService.score(companyId, batchId);
        if (!score.publishable()) {
            throw ConflictException.state("PUBLISH_BLOCKED", "The passport cannot be published yet")
                    .with("blockers", score.blockers());
        }
        Instant now = clock.instant();
        int version = passports.findFirstByBatchIdAndCompanyIdOrderByVersionDesc(batchId, companyId)
                .map(p -> p.getVersion() + 1).orElse(1);
        Built built = builder.build(companyId, batch, version, now, LocalDate.ofInstant(now, ZONE));
        if (!built.allApproved()) {
            // A step changed between the score and the snapshot; nothing unapproved is ever frozen.
            throw ConflictException.state("PUBLISH_BLOCKED", "A step is no longer approved");
        }

        passports.findByBatchIdAndCompanyIdAndStatus(batchId, companyId, PassportStatus.PUBLISHED)
                .ifPresent(previous -> previous.supersede(now));
        // The partial unique index allows one PUBLISHED version: the old one must be written first.
        passports.flush();
        Passport saved = passports.saveAndFlush(new Passport(batchId, companyId, version, built.snapshot().passport().gtin(),
                batch.getBatchNo(), built.snapshot(), sha256(built.snapshot()), score.score(), userId, now));
        batch.setStatus(BatchStatus.PUBLISHED);
        batch.touch(now);

        refreshPage(saved);
        audit(companyId, userId, "PASSPORT", saved.getId(), "PUBLISH",
                "{\"version\":" + version + ",\"completeness\":" + score.score() + "}");
        return toResponse(saved, names(List.of(saved)));
    }

    /** The passport as it would be published now, nothing saved; steps that are not approved show as such. */
    @Transactional(readOnly = true)
    public PassportSnapshot preview(UUID companyId, UUID batchId) {
        Batch batch = batches.findByIdAndCompanyId(batchId, companyId).orElseThrow(PassportService::batchNotFound);
        int version = passports.findFirstByBatchIdAndCompanyIdOrderByVersionDesc(batchId, companyId)
                .map(p -> p.getVersion() + 1).orElse(1);
        return builder.build(companyId, batch, version, null, LocalDate.ofInstant(clock.instant(), ZONE)).snapshot();
    }

    @Transactional(readOnly = true)
    public List<PassportVersionResponse> versions(UUID companyId, UUID batchId) {
        batches.findByIdAndCompanyId(batchId, companyId).orElseThrow(PassportService::batchNotFound);
        List<Passport> all = passports.findByBatchIdAndCompanyIdOrderByVersionDesc(batchId, companyId);
        Map<UUID, String> names = names(all);
        return all.stream().map(p -> toResponse(p, names)).toList();
    }

    @Transactional(readOnly = true)
    public PassportDetailResponse detail(UUID companyId, UUID id) {
        Passport passport = passports.findByIdAndCompanyId(id, companyId).orElseThrow(PassportService::notFound);
        return new PassportDetailResponse(toResponse(passport, names(List.of(passport))), passport.getSnapshot());
    }

    @Transactional
    public PassportVersionResponse withdraw(UUID companyId, UUID userId, UUID id, String reason) {
        UUID batchId = passports.findByIdAndCompanyId(id, companyId).orElseThrow(PassportService::notFound).getBatchId();
        // Batch first, then the passport row (publishing takes them in the same order).
        Batch batch = batches.lockForUpdate(batchId, companyId).orElseThrow(PassportService::batchNotFound);
        Passport passport = passports.lockByIdAndCompanyId(id, companyId).orElseThrow(PassportService::notFound);
        if (passport.getStatus() != PassportStatus.PUBLISHED) {
            throw ConflictException.state("NOT_PUBLISHED", "Only the published version can be withdrawn");
        }
        Instant now = clock.instant();
        passport.withdraw(userId, reason.trim(), now);
        passports.flush();
        if (batch.getStatus() == BatchStatus.PUBLISHED) {
            backToEditing(batch, now);
        }
        refreshPage(passport);
        audit(companyId, userId, "PASSPORT", id, "WITHDRAW", null);
        return toResponse(passport, names(List.of(passport)));
    }

    /**
     * "Yeni sürüm (taslak)": the batch can be changed again while the published version stays published and keeps
     * answering the QR code (decision 6). There is no draft row; the next version is built when it is published.
     */
    @Transactional
    public BatchResponse openDraft(UUID companyId, UUID userId, UUID batchId) {
        Batch batch = batches.lockForUpdate(batchId, companyId).orElseThrow(PassportService::batchNotFound);
        if (batch.getStatus() != BatchStatus.PUBLISHED) {
            throw ConflictException.state("BATCH_NOT_PUBLISHED", "Only a published batch has a version to build on");
        }
        backToEditing(batch, clock.instant());
        audit(companyId, userId, "BATCH", batchId, "PASSPORT_DRAFT", null);
        return batchService.get(companyId, batchId);
    }

    /**
     * The page of this code changed (a new version or a withdrawal): queued in this transaction, so it only runs when the
     * change is committed and is gone if it is rolled back. Opening a draft changes nothing public and queues nothing.
     */
    private void refreshPage(Passport passport) {
        jobs.enqueue(JobType.PASSPORT_CACHE_REFRESH,
                new PassportCacheRefreshJob.Payload(passport.getGtin(), passport.getBatchNo()));
    }

    /** COLLECTING, or READY when every step is approved (the batch's own rule). */
    private void backToEditing(Batch batch, Instant now) {
        batch.setStatus(BatchStatus.COLLECTING);
        batch.touch(now);
        progress.refresh(batch.getId());
    }

    private void audit(UUID companyId, UUID userId, String entityType, UUID entityId, String action,
            @Nullable String diff) {
        jdbc.update("""
                INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, diff)
                VALUES (?, ?, ?, ?, ?, ?::jsonb)
                """, companyId, userId, entityType, entityId, action, diff);
    }

    private Map<UUID, String> names(List<Passport> list) {
        List<UUID> ids = list.stream().flatMap(p -> java.util.stream.Stream.of(p.getPublishedBy(), p.getWithdrawnBy()))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        for (AppUser user : users.findAllById(ids)) {
            names.put(user.getId(), user.getFullName());
        }
        return names;
    }

    private PassportVersionResponse toResponse(Passport p, Map<UUID, String> names) {
        return new PassportVersionResponse(p.getId(), p.getBatchId(), p.getVersion(), p.getStatus(), p.getGtin(),
                p.getBatchNo(), digitalLink(p), p.getSchemaVersion(), p.getCompleteness(), VerificationCode.of(p.getSnapshotSha256()),
                p.getPublishedAt(), p.getPublishedBy() == null ? null : names.get(p.getPublishedBy()),
                p.getSupersededAt(), p.getWithdrawnAt(),
                p.getWithdrawnBy() == null ? null : names.get(p.getWithdrawnBy()), p.getWithdrawReason());
    }

    /** The QR code PNG of the batch's passport address; {@code size} is 512 or 1024 pixels (about). */
    @Transactional(readOnly = true)
    public Qr qrPng(UUID companyId, UUID id, int size) {
        if (size != 512 && size != 1024) {
            throw new InvalidFieldsException(new FieldViolation("size", "OneOf", "Must be 512 or 1024"));
        }
        Passport passport = passports.findByIdAndCompanyId(id, companyId).orElseThrow(PassportService::notFound);
        return new Qr(passport.getBatchNo(), qr.png(digitalLink(passport), size));
    }

    @Transactional(readOnly = true)
    public Qr qrSvg(UUID companyId, UUID id) {
        Passport passport = passports.findByIdAndCompanyId(id, companyId).orElseThrow(PassportService::notFound);
        return new Qr(passport.getBatchNo(), qr.svg(digitalLink(passport)).getBytes(StandardCharsets.UTF_8));
    }

    /** A QR image and the batch number it belongs to (for the file name). */
    public record Qr(String batchNo, byte[] bytes) {
    }

    /** The address of the passport page; the same for all versions of the batch. */
    String digitalLink(Passport p) {
        return Gs1DigitalLink.url(publicProperties.baseUrl(), p.getGtin(), p.getBatchNo());
    }

    /** SHA-256 of the snapshot's JSON text (declaration order of the records, so it can be recomputed from the row). */
    String sha256(PassportSnapshot snapshot) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(json.writeValueAsString(snapshot).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static NotFoundException batchNotFound() {
        return new NotFoundException("Batch not found");
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Passport not found");
    }
}
