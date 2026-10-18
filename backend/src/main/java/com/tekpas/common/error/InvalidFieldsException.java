package com.tekpas.common.error;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * Validation problem raised by a service, for rules that need more than the request body (e.g. a date
 * range on a partial update). Same shape as Bean Validation errors; 400 unless a subclass picks another status
 * (an upload that is too large is 413).
 */
public class InvalidFieldsException extends ApiException {

    private final List<FieldViolation> errors;

    public InvalidFieldsException(FieldViolation... errors) {
        this(HttpStatus.BAD_REQUEST, errors);
    }

    protected InvalidFieldsException(HttpStatus status, FieldViolation... errors) {
        super(status, ProblemTypes.VALIDATION, "Validation failed", "One or more fields are invalid");
        this.errors = List.of(errors);
    }

    public List<FieldViolation> errors() {
        return errors;
    }
}
