package com.tekpas.common.error;

/**
 * One field-level validation error. {@code code} is the constraint name (e.g. NotBlank) that clients
 * use to pick a translated message; {@code message} is an English fallback.
 */
public record FieldViolation(String field, String code, String message) {
}
