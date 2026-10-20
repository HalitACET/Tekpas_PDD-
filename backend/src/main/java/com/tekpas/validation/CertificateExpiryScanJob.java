package com.tekpas.validation;

import com.tekpas.document.DocType;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code CERT_EXPIRY_SCAN}, once a day (docs/m7-plan.md §5): queues a rule check for every batch that holds a confirmed
 * certificate ending within the warning days or already ended, published batches included. The day a certificate
 * crosses a limit nobody touches the batch, so nothing else would run the check. It only queues; the snapshot of a
 * published passport is never touched (the check writes issues, not passports).
 */
@Component
class CertificateExpiryScanJob implements JobHandler<CertificateExpiryScanJob.Payload> {

    private static final Logger log = LoggerFactory.getLogger(CertificateExpiryScanJob.class);

    /** Nothing to say: the job looks for what is due. */
    record Payload() {
    }

    private record Target(UUID companyId, UUID batchId) {
    }

    private final JdbcTemplate jdbc;
    private final ValidationTriggers triggers;
    private final Clock clock;

    CertificateExpiryScanJob(JdbcTemplate jdbc, ValidationTriggers triggers, Clock clock) {
        this.jdbc = jdbc;
        this.triggers = triggers;
        this.clock = clock;
    }

    @Override
    public JobType type() {
        return JobType.CERT_EXPIRY_SCAN;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        return Duration.ofMinutes(2);
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        LocalDate limit = LocalDate.ofInstant(clock.instant(), ValidationService.ZONE).plusDays(ConsistencyRules.EXPIRING_DAYS);
        List<Target> due = jdbc.query("""
                SELECT DISTINCT b.company_id, b.id
                FROM document d JOIN supply_step s ON s.id = d.step_id JOIN batch b ON b.id = s.batch_id
                WHERE d.review_status = 'VERIFIED' AND d.valid_until IS NOT NULL AND d.valid_until <= ?
                  AND d.doc_type IN (%s)
                """.formatted(certificateTypes()),
                (rs, n) -> new Target(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)), java.sql.Date.valueOf(limit));
        due.forEach(t -> triggers.batchChanged(t.companyId(), t.batchId()));
        log.info("Certificate expiry scan queued {} batch check(s)", due.size());
    }

    /** Enum constants only, so the list is safe to inline. */
    static String certificateTypes() {
        return Arrays.stream(DocType.values()).filter(DocType::isCertificate).map(t -> "'" + t.name() + "'")
                .collect(Collectors.joining(", "));
    }
}
