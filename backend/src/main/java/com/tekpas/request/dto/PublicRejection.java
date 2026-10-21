package com.tekpas.request.dto;

import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The correction the manufacturer asked for (design v0.4 45).
 *
 * @param fields step data fields to correct, marked on the form
 * @param byName who asked, e.g. "Elif Yılmaz"
 * @param submitterName who sent the data being corrected, to fill the form's sender back in (M10 T2)
 * @param submitterRole their role as they gave it
 */
public record PublicRejection(String reason, List<String> fields, Instant at, String byName,
        @Nullable String submitterName, @Nullable String submitterRole) {
}
