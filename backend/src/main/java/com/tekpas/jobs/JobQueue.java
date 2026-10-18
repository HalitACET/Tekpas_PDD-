package com.tekpas.jobs;

import java.time.Clock;
import java.time.Duration;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;

/**
 * Adds jobs. Call it inside the transaction that creates the thing the job works on: if that transaction rolls
 * back, the job goes with it. The worker is woken right after the commit, so a job starts without waiting for a
 * poll (and without a poll that would keep the database awake, see {@link JobWorker}).
 */
@Component
public class JobQueue {

    private final JobStore store;
    private final JobWorker worker;
    private final ObjectMapper json;
    private final Clock clock;

    JobQueue(JobStore store, JobWorker worker, ObjectMapper json, Clock clock) {
        this.store = store;
        this.worker = worker;
        this.json = json;
        this.clock = clock;
    }

    /** @param payload a record; it is stored as JSON and read back as the handler's payload type */
    public long enqueue(JobType type, Object payload) {
        long id = store.insert(type, json.writeValueAsString(payload), clock.instant());
        wakeAfterCommit();
        return id;
    }

    /**
     * For recurring jobs: queues one unless a job of the type is waiting or running, or one was queued within
     * {@code within}. Returns whether it queued.
     */
    public boolean enqueueUnlessRecent(JobType type, Object payload, Duration within) {
        if (store.hasRecent(type, clock.instant().minus(within))) {
            return false;
        }
        enqueue(type, payload);
        return true;
    }

    private void wakeAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    worker.wake();
                }
            });
        } else {
            worker.wake();
        }
    }
}
