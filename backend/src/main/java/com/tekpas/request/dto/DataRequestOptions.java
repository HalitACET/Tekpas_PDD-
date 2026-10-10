package com.tekpas.request.dto;

import org.jspecify.annotations.Nullable;

/**
 * How long a link stays valid (design v0.4 46a "Son tarih": 3, 7 or 14 days from its creation).
 *
 * @param validDays 3, 7 or 14; 7 when not given
 */
public record DataRequestOptions(@Nullable Integer validDays) {
}
