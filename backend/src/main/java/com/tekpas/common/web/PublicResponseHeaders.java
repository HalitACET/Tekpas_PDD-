package com.tekpas.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Answers of the supplier's link (/api/v1/public/**, also its errors) are never cached or indexed and send no
 * referrer: they belong to one holder (K21).
 */
@Component
public class PublicResponseHeaders extends OncePerRequestFilter {

    private static final String PASSPORTS = "/api/v1/public/passports/";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/public/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getRequestURI().startsWith(PASSPORTS)) {
            // The passport is for everyone: the controller sets Cache-Control on a good answer, errors stay uncached.
            // No indexing while the addresses are demo ones (docs/m6-plan.md §9 decision 12).
            response.setHeader("X-Robots-Tag", "noindex");
            response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        } else {
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("X-Robots-Tag", "noindex, nofollow");
            response.setHeader("Referrer-Policy", "no-referrer");
        }
        chain.doFilter(request, response);
    }
}
