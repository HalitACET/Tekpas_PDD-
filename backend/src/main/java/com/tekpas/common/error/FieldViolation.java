package com.tekpas.common.error;

import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * One field-level error. {@code code} is the constraint name (e.g. NotBlank, GtinCheckDigit) that clients
 * use to pick a translated message; {@code message} is an English fallback; {@code params} carries values
 * the translated message shows (e.g. {@code total} for FiberTotal).
 */
public record FieldViolation(String field, String code, @Nullable String message,
        @Nullable Map<String, Object> params) {

    public FieldViolation(String field, String code, @Nullable String message) {
        this(field, code, message, null);
    }
}
