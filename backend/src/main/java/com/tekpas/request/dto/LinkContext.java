package com.tekpas.request.dto;

import com.tekpas.supplychain.StepType;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * What a closed link still tells its holder (design v0.4 44): who asked, for which step, until when, and for a
 * submitted form who sent it. Nothing about the chain or other suppliers.
 *
 * @param requesterName the panel user who created the link, the contact on the page (name only)
 */
public record LinkContext(String manufacturerName, String requesterName, StepType stepType, Instant expiresAt,
        @Nullable String submitterName, @Nullable Instant submittedAt, @Nullable String code) {
}
