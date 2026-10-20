package com.tekpas.validation.dto;

import com.tekpas.supplychain.StepType;
import com.tekpas.validation.IssueCode;
import com.tekpas.validation.IssueParams;
import com.tekpas.validation.IssueSeverity;
import com.tekpas.validation.IssueSource;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One finding. The words are the client's (translation files, by {@code code}); {@code params} carries the data the
 * card shows. {@code supplierName} is the step's supplier, the "firma" of the card's source line.
 */
public record IssueResponse(
        UUID id,
        IssueCode code,
        IssueSeverity severity,
        IssueSource source,
        @Nullable UUID stepId,
        @Nullable StepType stepType,
        @Nullable String supplierName,
        @Nullable UUID documentId,
        IssueParams params,
        boolean resolved,
        boolean autoResolved,
        @Nullable Instant resolvedAt,
        @Nullable String resolvedByName,
        @Nullable String note,
        Instant createdAt) {
}
