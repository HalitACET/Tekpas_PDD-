package com.tekpas.document;

import java.text.Normalizer;
import org.jspecify.annotations.Nullable;

/** Text typed by a person or returned by the reading, made safe to store and show. */
public final class DocumentText {

    private DocumentText() {
    }

    /**
     * Composed form, no control or format characters (NUL, bidi overrides, zero-width), single spaces, trimmed.
     * Blank becomes null.
     */
    public static @Nullable String clean(@Nullable String value) {
        if (value == null) {
            return null;
        }
        String cleaned = Normalizer.normalize(value, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cc}\\p{Cf}&&[^\\t\\n\\r]]", "")
                .replaceAll("\\s+", " ")
                .strip();
        return cleaned.isEmpty() ? null : cleaned;
    }
}
