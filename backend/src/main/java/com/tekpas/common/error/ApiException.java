package com.tekpas.common.error;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** Base for exceptions that map one-to-one to a ProblemDetail response. */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final URI type;
    private final String title;
    private final Map<String, Object> properties = new LinkedHashMap<>();

    protected ApiException(HttpStatus status, URI type, String title, String detail) {
        super(detail);
        this.status = status;
        this.type = type;
        this.title = title;
    }

    /** An extra property of the problem body (e.g. a reason code), set by the subclass. */
    protected final void property(String name, Object value) {
        properties.put(name, value);
    }

    public Map<String, Object> properties() {
        return properties;
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
