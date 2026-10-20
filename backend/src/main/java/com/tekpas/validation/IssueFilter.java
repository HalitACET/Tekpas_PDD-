package com.tekpas.validation;

import io.swagger.v3.oas.annotations.media.Schema;

/** The tab's filter: Açık, Çözülen, or both. */
@Schema(enumAsRef = true)
public enum IssueFilter {
    OPEN, RESOLVED, ALL;

    boolean accepts(ValidationIssue issue) {
        return switch (this) {
            case OPEN -> !issue.isResolved();
            case RESOLVED -> issue.isResolved();
            case ALL -> true;
        };
    }
}
