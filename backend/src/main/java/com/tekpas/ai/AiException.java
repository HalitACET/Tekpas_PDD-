package com.tekpas.ai;

/**
 * The LLM gave no usable answer. The message is fixed text plus at most an HTTP status: it is logged and stored in
 * {@code job.last_error}, so it never carries the response body (which can echo the document), the request or the
 * key. For the same reason no cause is attached.
 */
public class AiException extends RuntimeException {

    public enum Kind {
        /** 429: quota or rate limit. Not retried, the reading falls back to manual entry. */
        RATE_LIMITED,
        /** Timeout, network, 408 or 5xx: worth another attempt (the job's retries). */
        UNAVAILABLE,
        /** Another 4xx: key, model name or request refused. Another attempt would fail the same way. */
        REJECTED,
        /** An answer without content: blocked, cut off or empty. */
        NO_ANSWER
    }

    private final Kind kind;

    public AiException(Kind kind, String message) {
        super(message, null, false, false);
        this.kind = kind;
    }

    public Kind kind() {
        return kind;
    }

    public boolean retryable() {
        return kind == Kind.UNAVAILABLE;
    }
}
