package com.tekpas.jobs;

/** Which run this is: {@code attempt} counts from 1 and never exceeds {@code maxAttempts}. */
public record JobContext(long jobId, int attempt, int maxAttempts) {

    public boolean lastAttempt() {
        return attempt >= maxAttempts;
    }
}
