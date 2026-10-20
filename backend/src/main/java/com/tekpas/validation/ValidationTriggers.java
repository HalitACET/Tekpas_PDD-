package com.tekpas.validation;

import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * What queues a rule check (docs/m7-plan.md §5): called, inside the transaction that changed the data, by the places
 * that change what the rules read. The check itself runs after the commit as {@code RULE_VALIDATE_BATCH}, so the
 * Uyarılar tab and the badges are current the next time they are read. A check already waiting for the batch is enough.
 */
@Component
public class ValidationTriggers {

    private final JobQueue jobs;
    private final JdbcTemplate jdbc;

    ValidationTriggers(JobQueue jobs, JdbcTemplate jdbc) {
        this.jobs = jobs;
        this.jdbc = jdbc;
    }

    /** The batch's steps, documents, dates or chain changed. */
    public void batchChanged(UUID companyId, UUID batchId) {
        jobs.enqueueUnlessQueued(JobType.RULE_VALIDATE_BATCH, new ValidateBatchJob.Payload(companyId, batchId));
    }

    /** A step's document was uploaded, confirmed or removed. */
    public void stepChanged(UUID companyId, UUID stepId) {
        List<UUID> batchIds = jdbc.queryForList("""
                SELECT s.batch_id FROM supply_step s JOIN batch b ON b.id = s.batch_id
                WHERE s.id = ? AND b.company_id = ?
                """, UUID.class, stepId, companyId);
        batchIds.forEach(id -> batchChanged(companyId, id));
    }

    /** The product's label composition changed: every batch of the product reads it. */
    public void productChanged(UUID companyId, UUID productId) {
        jdbc.queryForList("SELECT id FROM batch WHERE product_id = ? AND company_id = ?", UUID.class, productId,
                companyId).forEach(id -> batchChanged(companyId, id));
    }
}
