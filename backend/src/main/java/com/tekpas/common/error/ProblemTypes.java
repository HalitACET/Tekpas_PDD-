package com.tekpas.common.error;

import java.net.URI;

/** Problem type URIs. Clients map these to translated messages; title and detail stay in English. */
public final class ProblemTypes {

    public static final URI BAD_REQUEST = of("bad-request");
    public static final URI VALIDATION = of("validation");
    public static final URI UNAUTHORIZED = of("unauthorized");
    public static final URI FORBIDDEN = of("forbidden");
    public static final URI NOT_FOUND = of("not-found");
    public static final URI INVALID_CREDENTIALS = of("invalid-credentials");
    public static final URI INVALID_REFRESH_TOKEN = of("invalid-refresh-token");
    public static final URI INTERNAL = of("internal");

    private ProblemTypes() {
    }

    private static URI of(String slug) {
        return URI.create("urn:tekpas:problem:" + slug);
    }
}
