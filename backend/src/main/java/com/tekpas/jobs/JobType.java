package com.tekpas.jobs;

/** What a background job does (V9 {@code chk_job_type}); {@code maxAttempts} is fixed when the job is queued. */
public enum JobType {
    /** Read a document (M5 T4/T5); retried at most 3 times (docs/m5-plan.md §3). */
    AI_EXTRACT_DOCUMENT(3),
    AI_VALIDATE_BATCH(3),
    AI_TRANSLATE_PASSPORT(3),
    RULE_VALIDATE_BATCH(3),
    IMPORT_EXCEL(1),
    CERT_EXPIRY_SCAN(3),
    PUSH_NOTIFY(3),
    /** Remove documents of links that closed without a submission, 7 days on (M5 T3). */
    DOCUMENT_CLEANUP(3),
    /** Drop the web app's cached passport page after a publishing or a withdrawal and warm it (M6 T4). */
    PASSPORT_CACHE_REFRESH(4);

    private final int maxAttempts;

    JobType(int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    public int maxAttempts() {
        return maxAttempts;
    }
}
