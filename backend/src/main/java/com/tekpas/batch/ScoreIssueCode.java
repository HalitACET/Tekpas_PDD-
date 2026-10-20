package com.tekpas.batch;

import io.swagger.v3.oas.annotations.media.Schema;

/** Blockers stop the publishing; warnings do not (docs/m6-plan.md §2). */
@Schema(enumAsRef = true)
public enum ScoreIssueCode {
    // blockers
    NO_CHAIN, STEP_NOT_APPROVED, CERTIFICATE_EXPIRED, SCORE_BELOW_THRESHOLD,
    // warnings
    UNREVIEWED_DOCUMENTS, CERTIFICATE_EXPIRING
}
