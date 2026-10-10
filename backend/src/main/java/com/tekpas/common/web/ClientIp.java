package com.tekpas.common.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The client's IP for rate limits. In production the chain is client → Vercel (rewrite, K18) → Render, and
 * each proxy appends the address it received the request from to X-Forwarded-For. The client can put anything
 * in front, so the address is read from the right: skipping the {@code trusted-proxies} entries our own
 * proxies appended, the next one is what Vercel saw. 0 (local) uses the socket address; a negative value turns
 * the client IP off (unknown for every request), for when the live chain could not be confirmed.
 */
@Component
public class ClientIp {

    private final int trustedProxies;

    public ClientIp(@Value("${tekpas.client-ip.trusted-proxies:0}") int trustedProxies) {
        this.trustedProxies = trustedProxies;
    }

    /** Null when the header has fewer entries than our proxies add (not a request through them). */
    public @Nullable String of(HttpServletRequest request) {
        if (trustedProxies < 0) {
            return null;
        }
        if (trustedProxies == 0) {
            return request.getRemoteAddr();
        }
        List<String> hops = hops(request);
        int index = hops.size() - 1 - trustedProxies;
        return index >= 0 ? hops.get(index) : null;
    }

    /** X-Forwarded-For entries, oldest first. */
    public static List<String> hops(HttpServletRequest request) {
        String header = request.getHeader("X-Forwarded-For");
        if (header == null || header.isBlank()) {
            return List.of();
        }
        return Arrays.stream(header.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
