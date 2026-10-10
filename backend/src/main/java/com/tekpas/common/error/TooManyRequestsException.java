package com.tekpas.common.error;

import org.springframework.http.HttpStatus;

/** 429: a rate limit was hit; the answer carries Retry-After. */
public class TooManyRequestsException extends ApiException {

    private final long retryAfterSeconds;

    public TooManyRequestsException(long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, ProblemTypes.TOO_MANY_REQUESTS, "Too many requests",
                "Too many requests, try again later");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
