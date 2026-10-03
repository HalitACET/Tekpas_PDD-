package com.tekpas.common.error;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * 400 validation problem raised by a service, for rules that need more than the request body (e.g. a date
 * range on a partial update). Same shape as Bean Validation errors.
 */
public class InvalidFieldsException extends ApiException {

    private final List<FieldViolation> errors;

    public InvalidFieldsException(FieldViolation... errors) {
        super(HttpStatus.BAD_REQUEST, ProblemTypes.VALIDATION, "Validation failed", "One or more fields are invalid");
        this.errors = List.of(errors);
    }

    public List<FieldViolation> errors() {
        return errors;
    }
}
