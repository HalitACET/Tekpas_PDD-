package com.tekpas.batch;

import com.tekpas.supplychain.StepStatus;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The batch's stage follows its chain (PLAN M4): DRAFT until the first data request, COLLECTING while steps
 * wait, READY once every step is approved. A published batch is left alone (M6).
 */
@Component
public class BatchProgress {

    private final BatchRepository batches;
    private final EntityManager entityManager;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public BatchProgress(BatchRepository batches, EntityManager entityManager, JdbcTemplate jdbc, Clock clock) {
        this.batches = batches;
        this.entityManager = entityManager;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Called in the transaction that changed the chain or sent a request. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void refresh(UUID batchId) {
        // The caller's step changes must be in the database before the statuses are read with SQL.
        entityManager.flush();
        Batch batch = batches.findById(batchId).orElseThrow();
        if (batch.getStatus() == BatchStatus.PUBLISHED) {
            return;
        }
        List<String> statuses = jdbc.queryForList("SELECT status FROM supply_step WHERE batch_id = ?", String.class,
                batchId);
        boolean allApproved = !statuses.isEmpty() && statuses.stream().allMatch(StepStatus.APPROVED.name()::equals);
        Boolean requested = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM data_request r JOIN supply_step s ON s.id = r.step_id
                               WHERE s.batch_id = ?)
                """, Boolean.class, batchId);
        BatchStatus next = allApproved ? BatchStatus.READY
                : Boolean.TRUE.equals(requested) || batch.getStatus() == BatchStatus.READY ? BatchStatus.COLLECTING
                : batch.getStatus();
        if (next != batch.getStatus()) {
            batch.setStatus(next);
            batch.touch(clock.instant());
        }
    }
}
