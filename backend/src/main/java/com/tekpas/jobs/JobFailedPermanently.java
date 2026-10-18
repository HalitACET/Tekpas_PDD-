package com.tekpas.jobs;

/**
 * A failure that another attempt cannot fix (an encrypted file, a payload that names nothing): the job ends as
 * FAILED without retries. The message is stored in {@code job.last_error}; it must not carry secrets.
 */
public class JobFailedPermanently extends RuntimeException {

    public JobFailedPermanently(String message) {
        super(message);
    }

    public JobFailedPermanently(String message, Throwable cause) {
        super(message, cause);
    }
}
