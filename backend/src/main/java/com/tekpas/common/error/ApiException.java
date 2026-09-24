package com.tekpas.common.error;

import java.net.URI;
import org.springframework.http.HttpStatus;

/** Base for exceptions that map one-to-one to a ProblemDetail response. */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final URI type;
    private final String title;

    protected ApiException(HttpStatus status, URI type, String title, String detail) {
        super(detail);
        this.status = status;
        this.type = type;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    public URI type() {
        return type;
    }

    public String title() {
        return title;
    }
}
