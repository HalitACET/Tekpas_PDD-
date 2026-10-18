package com.tekpas.document;

import org.jspecify.annotations.Nullable;

/**
 * What the person did with each proposed field when confirming a document ({@code document.verification}, V1/V9),
 * the measure of how right the reading was (the report's accuracy figure). A field that was neither proposed nor
 * typed is null.
 */
public record Verification(@Nullable FieldCheck docType, @Nullable FieldCheck certNo,
        @Nullable FieldCheck holderName, @Nullable FieldCheck issuer, @Nullable FieldCheck validFrom,
        @Nullable FieldCheck validUntil) {

    /**
     * @see #of(Object, Object)
     */
    public enum FieldCheck {
        /** The proposed value was confirmed as it was. */
        ACCEPTED,
        /** A value was proposed and the person changed it (or cleared it). */
        EDITED,
        /** Nothing was proposed and the person typed a value. */
        ADDED
    }

    /**
     * The check of one field: {@code proposed} is what the reading offered, {@code confirmed} what the person kept.
     * Both are compared as given (strings, ISO dates); null means "nothing".
     */
    public static @Nullable FieldCheck of(@Nullable Object proposed, @Nullable Object confirmed) {
        if (proposed == null) {
            return confirmed == null ? null : FieldCheck.ADDED;
        }
        return proposed.equals(confirmed) ? FieldCheck.ACCEPTED : FieldCheck.EDITED;
    }
}
