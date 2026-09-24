package com.tekpas.auth;

import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Web refresh token cookie: httpOnly (no JS access), SameSite=Strict, sent only to /api/v1/auth.
 * In production the web app reaches the API through its own origin (K18), so the cookie is first-party.
 */
@Component
public class RefreshCookies {

    public static final String NAME = "tekpas_rt";
    public static final String PATH = "/api/v1/auth";

    private final JwtProperties jwtProperties;
    private final AuthProperties authProperties;

    public RefreshCookies(JwtProperties jwtProperties, AuthProperties authProperties) {
        this.jwtProperties = jwtProperties;
        this.authProperties = authProperties;
    }

    public ResponseCookie create(String rawToken) {
        return base(rawToken).maxAge(jwtProperties.refreshTtl()).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite("Strict")
                .path(PATH);
    }
}
