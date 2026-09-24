package com.tekpas.common.error;

import org.jspecify.annotations.Nullable;

/**
 * One field-level validation error. {@code code} is the constraint name (e.g. NotBlank) that clients
 * use to pick a translated message; {@code message} is an English fallback.
 */
public record FieldViolation(String field, String code, @Nullable String message) {
}
