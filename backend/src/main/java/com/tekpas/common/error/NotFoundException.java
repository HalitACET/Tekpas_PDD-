package com.tekpas.common.error;

import org.springframework.http.HttpStatus;

/**
 * Also thrown when a record exists but belongs to another company, so that its existence is not leaked.
 */
public class NotFoundException extends ApiException {

    public NotFoundException(String detail) {
        super(HttpStatus.NOT_FOUND, ProblemTypes.NOT_FOUND, "Not found", detail);
    }
}
