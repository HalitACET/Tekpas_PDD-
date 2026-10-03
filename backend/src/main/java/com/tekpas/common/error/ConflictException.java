package com.tekpas.common.error;

import java.net.URI;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;

/**
 * 409. Either tied to a field (a unique value that is taken: {@code errors} carries the field, code Unique)
 * or to the state of the record ({@code reason}, e.g. PRODUCT_HAS_BATCHES). The detail never names
 * another company or its records.
 */
public class ConflictException extends ApiException {

    private final List<FieldViolation> errors;
    private final @Nullable String reason;

    private ConflictException(URI type, String detail, List<FieldViolation> errors, @Nullable String reason) {
        super(HttpStatus.CONFLICT, type, "Conflict", detail);
        this.errors = errors;
        this.reason = reason;
    }

    public static ConflictException taken(String field, String detail) {
        return new ConflictException(ProblemTypes.CONFLICT, detail,
                List.of(new FieldViolation(field, "Unique", detail)), null);
    }

    public static ConflictException state(String reason, String detail) {
        return new ConflictException(ProblemTypes.CONFLICT, detail, List.of(), reason);
    }

    public static ConflictException state(URI type, String reason, String detail) {
        return new ConflictException(type, detail, List.of(), reason);
    }

    public List<FieldViolation> errors() {
        return errors;
    }

    public @Nullable String reason() {
        return reason;
    }
}
