package com.tekpas.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * One line per request: {@code [ab12-cd34] GET /api/v1/products 200 12ms} (the id comes from the MDC, see
 * {@link RequestIdFilter}). Only the method, the masked path, the status and the duration: never the query
 * string, headers or bodies. Health checks (Render, the keep-awake cron) are left out.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger("com.tekpas.access");

    static final String MASK = "***";

    /** Segments after which the next segment is a link token (web /r/{token}, M4 data request links). */
    private static final Set<String> TOKEN_PARENTS = Set.of("r");
    private static final Pattern UUID = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    /**
     * A secret-looking segment: 16+ URL-safe characters that are not a UUID or a plain number. Our tokens are
     * 32 random bytes in base64url (43 characters); ids are UUIDs and stay readable.
     */
    private static final Pattern TOKEN_LIKE = Pattern.compile("^[A-Za-z0-9_-]{16,}$");
    private static final Pattern NUMBER = Pattern.compile("^\\d+$");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/actuator/health");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        boolean failed = true;
        try {
            chain.doFilter(request, response);
            failed = false;
        } finally {
            long millis = (System.nanoTime() - start) / 1_000_000;
            // An exception escaping the chain becomes a 500 in the container.
            int status = failed ? HttpServletResponse.SC_INTERNAL_SERVER_ERROR : response.getStatus();
            log.info("{} {} {} {}ms", request.getMethod(), maskPath(request.getRequestURI()), status, millis);
        }
    }

    /** The path with link tokens replaced by {@value #MASK}; the query string is never part of it. */
    static String maskPath(String path) {
        String[] segments = path.split("/", -1);
        StringBuilder masked = new StringBuilder(path.length());
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                masked.append('/');
            }
            String segment = segments[i];
            boolean afterTokenParent = i > 0 && TOKEN_PARENTS.contains(segments[i - 1]) && !segment.isEmpty();
            masked.append(afterTokenParent || looksLikeToken(segment) ? MASK : segment);
        }
        return masked.toString();
    }

    private static boolean looksLikeToken(String segment) {
        return TOKEN_LIKE.matcher(segment).matches() && !UUID.matcher(segment).matches()
                && !NUMBER.matcher(segment).matches() && !isWord(segment);
    }

    /** Long path words like "chain-preview" or "status-counts" are lower-case letters and dashes. */
    private static boolean isWord(String segment) {
        return segment.chars().allMatch(c -> (c >= 'a' && c <= 'z') || c == '-');
    }
}
