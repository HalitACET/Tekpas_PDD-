package com.tekpas.common.web;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.MDC;

/**
 * Short id of one API request ("ab12-cd34"). It is in every log line of the request (MDC), in the
 * X-Request-Id response header and in error bodies (requestId), so a user's report can be matched to the log.
 */
public final class RequestId {

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";

    /** A caller's own id is kept only in this shape: nothing that could forge or break a log line. */
    private static final Pattern ACCEPTED = Pattern.compile("^[a-f0-9-]{8,36}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private RequestId() {
    }

    /** The caller's id when it is safe to log, otherwise a fresh one. */
    static String from(@Nullable String header) {
        return header != null && ACCEPTED.matcher(header).matches() ? header : generate();
    }

    static String generate() {
        byte[] bytes = new byte[4];
        RANDOM.nextBytes(bytes);
        String hex = HexFormat.of().formatHex(bytes);
        return hex.substring(0, 4) + "-" + hex.substring(4);
    }

    /** The id of the request this thread is serving, or null outside a request. */
    public static @Nullable String current() {
        return MDC.get(MDC_KEY);
    }
}
