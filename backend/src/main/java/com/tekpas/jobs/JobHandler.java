package com.tekpas.jobs;

import java.time.Duration;

/**
 * Runs one type of job. Handlers are idempotent: a job can run again after a crash, a timeout or a retry, and the
 * result must be the same (e.g. the document it reads may already be read, or deleted).
 *
 * <p>Throwing {@link JobFailedPermanently} ends the job at once (FAILED); any other exception is retried after
 * 30 s, 2 min, then 10 min until {@link JobType#maxAttempts()} is used up (DEAD).
 *
 * @param <P> the payload, a record read from the job's JSON
 */
public interface JobHandler<P> {

    JobType type();

    Class<P> payloadType();

    void handle(P payload, JobContext context) throws Exception;

    /** How long one attempt may take; the worker stops waiting after it and counts a failed attempt. */
    default Duration timeout() {
        return Duration.ofSeconds(60);
    }

    /**
     * Called once when the job ends without success (FAILED or DEAD), e.g. to mark a document as unreadable. Must
     * not throw; whatever it throws is logged and ignored.
     */
    default void onGiveUp(P payload, String reason) {
    }
}
