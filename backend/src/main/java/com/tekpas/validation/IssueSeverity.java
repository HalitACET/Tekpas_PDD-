package com.tekpas.validation;

import io.swagger.v3.oas.annotations.media.Schema;

/** V1 {@code chk_issue_severity}. ERROR blocks publishing and cannot be resolved by hand (docs/m7-plan.md §2). */
@Schema(enumAsRef = true)
public enum IssueSeverity {
    INFO, WARNING, ERROR
}
