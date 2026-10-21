package com.tekpas.validation;

import com.tekpas.document.DocType;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import com.tekpas.notification.PushNotifications;
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
 * published passport is never touched (the check writes issues, not passports). Certificates that enter the warning
 * days today get one notification a company (docs/m9-plan.md §4.3), counted as the task list groups them.
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
    private final PushNotifications pushes;
    private final Clock clock;

    CertificateExpiryScanJob(JdbcTemplate jdbc, ValidationTriggers triggers, PushNotifications pushes, Clock clock) {
        this.jdbc = jdbc;
        this.triggers = triggers;
        this.pushes = pushes;
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
        notifyEntered(limit);
    }

    /** One certificate a supplier (or holder), type and end date, as the task list shows it. */
    private void notifyEntered(LocalDate limit) {
        jdbc.query("""
                SELECT b.company_id,
                       COUNT(DISTINCT (COALESCE(s.supplier_company_id::text, d.holder_name, s.id::text), d.doc_type))
                FROM document d JOIN supply_step s ON s.id = d.step_id JOIN batch b ON b.id = s.batch_id
                WHERE d.review_status = 'VERIFIED' AND d.valid_until = ? AND d.doc_type IN (%s)
                GROUP BY b.company_id
                """.formatted(certificateTypes()),
                rs -> {
                    pushes.certificatesExpiring(rs.getObject(1, UUID.class), rs.getInt(2));
                }, java.sql.Date.valueOf(limit));
    }

    /** Enum constants only, so the list is safe to inline. */
    static String certificateTypes() {
        return Arrays.stream(DocType.values()).filter(DocType::isCertificate).map(t -> "'" + t.name() + "'")
                .collect(Collectors.joining(", "));
    }
}
