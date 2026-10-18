package com.tekpas.document;

import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Removes what suppliers uploaded through a link that closed without a submission (expired or revoked), 7 days
 * after it closed (docs/m5-plan.md §7.5). A document someone verified stays, as does anything of a submitted
 * link or uploaded from the panel. Runs once a day ({@code DOCUMENT_CLEANUP}); each removal leaves a
 * {@code DOCUMENT_REMOVED} event with the reason. Queued daily by {@link DocumentCleanupSchedule}.
 */
@Component
class DocumentCleanupJob implements JobHandler<DocumentCleanupJob.Payload> {

    private static final Logger log = LoggerFactory.getLogger(DocumentCleanupJob.class);

    static final Duration KEEP_AFTER_CLOSE = Duration.ofDays(7);
    static final int BATCH = 100;
    static final String REASON = "LINK_CLOSED_WITHOUT_SUBMISSION";

    /** Nothing to say: the job looks for what is due. */
    record Payload() {
    }

    private record Due(UUID id, UUID stepId, UUID requestId, String fileKey, String docType) {
    }

    private final JdbcTemplate jdbc;
    private final StepEvents events;
    private final DocumentStore store;
    private final Clock clock;
    private final TransactionTemplate tx;

    DocumentCleanupJob(JdbcTemplate jdbc, StepEvents events, DocumentStore store, Clock clock,
            PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.events = events;
        this.store = store;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    @Override
    public JobType type() {
        return JobType.DOCUMENT_CLEANUP;
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
        int removed = 0;
        List<Due> due;
        do {
            due = due(clock.instant().minus(KEEP_AFTER_CLOSE));
            for (Due d : due) {
                if (remove(d)) {
                    store.discard(d.fileKey());
                    removed++;
                }
            }
        } while (due.size() == BATCH && !Thread.currentThread().isInterrupted());
        if (removed > 0) {
            log.info("Removed {} document(s) of links closed without a submission", removed);
        }
    }

    /** Closed means revoked (at revoked_at) or past its deadline (expires_at; EXPIRED is only set when read). */
    private List<Due> due(Instant closedBefore) {
        return jdbc.query("""
                SELECT d.id, d.step_id, d.request_id, d.file_key, d.doc_type
                FROM document d JOIN data_request r ON r.id = d.request_id
                WHERE d.review_status = 'UNREVIEWED'
                  AND d.step_id IS NOT NULL
                  AND r.status <> 'COMPLETED'
                  AND CASE WHEN r.status = 'REVOKED' THEN COALESCE(r.revoked_at, r.expires_at) ELSE r.expires_at END < ?
                ORDER BY d.created_at
                LIMIT ?
                """, (rs, n) -> new Due(rs.getObject("id", UUID.class), rs.getObject("step_id", UUID.class),
                rs.getObject("request_id", UUID.class), rs.getString("file_key"), rs.getString("doc_type")),
                Timestamp.from(closedBefore), BATCH);
    }

    /** The row and its event in one transaction; false when someone verified or removed it meanwhile. */
    private boolean remove(Due d) {
        Boolean done = tx.execute(status -> {
            int rows = jdbc.update("DELETE FROM document WHERE id = ? AND review_status = 'UNREVIEWED'", d.id());
            if (rows == 0) {
                return false;
            }
            events.record(d.stepId(), d.requestId(), StepEventKind.DOCUMENT_REMOVED, null, null,
                    Map.of("documentId", d.id().toString(), "docType", d.docType(), "reason", REASON));
            return true;
        });
        return Boolean.TRUE.equals(done);
    }
}
