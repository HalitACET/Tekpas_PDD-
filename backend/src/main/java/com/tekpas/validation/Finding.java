package com.tekpas.validation;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One thing a rule found, before it is compared with what is stored. The {@code fingerprint} says "the same finding
 * again" (code, step, document and a digest of the data it is about): when the data changes the finding is a new one.
 *
 * @param message a short English line for logs and the API's consumers; the panel writes its own words from the
 *     translation files (docs/m7-plan.md §9 decision 4)
 */
public record Finding(IssueCode code, @Nullable UUID stepId, @Nullable UUID documentId, IssueParams params,
        String fingerprint, String message) {

    public IssueSeverity severity() {
        return code.severity();
    }
}
