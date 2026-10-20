package com.tekpas.validation.dto;

import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The issues of a batch (the filtered ones, most severe first) with the counts of both sides of the tab's filter:
 * {@code open} by severity and the number of {@code resolved}. {@code validatedAt} is when the rules last ran.
 */
public record IssueListResponse(List<IssueResponse> issues, IssueCounts open, int resolved,
        @Nullable Instant validatedAt) {
}
