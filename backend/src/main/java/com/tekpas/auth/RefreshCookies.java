package com.tekpas.auth;

import java.time.Duration;
import java.util.List;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * Web refresh token cookie: httpOnly (no JS access), SameSite=Strict, sent only to /api/v1/auth.
 * In production the web app reaches the API through its own origin (K18), so the cookie is first-party.
 *
 * <p>"Remember me" off: the refresh cookie has no Max-Age (a session cookie, gone when the browser
 * closes). A companion session cookie {@value #MODE_NAME} carries that choice to later refreshes, so the
 * rotated cookie stays a session cookie; the database is unaware of the mode.
 */
@Component
public class RefreshCookies {

    public static final String NAME = "tekpas_rt";
    public static final String MODE_NAME = "tekpas_rt_mode";
    public static final String MODE_SESSION = "session";
    public static final String PATH = "/api/v1/auth";

    private final JwtProperties jwtProperties;
    private final AuthProperties authProperties;

    public RefreshCookies(JwtProperties jwtProperties, AuthProperties authProperties) {
        this.jwtProperties = jwtProperties;
        this.authProperties = authProperties;
    }

    /** Refresh cookie plus the mode cookie that matches it (set for session, cleared for persistent). */
    public List<ResponseCookie> create(String rawToken, boolean persistent) {
        if (persistent) {
            return List.of(base(NAME, rawToken).maxAge(jwtProperties.refreshTtl()).build(), expired(MODE_NAME));
        }
        return List.of(base(NAME, rawToken).build(), base(MODE_NAME, MODE_SESSION).build());
    }

    public List<ResponseCookie> clear() {
        return List.of(expired(NAME), expired(MODE_NAME));
    }

    public static boolean isSessionMode(String modeCookie) {
        return MODE_SESSION.equals(modeCookie);
    }

    private ResponseCookie expired(String name) {
        return base(name, "").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String name, String value) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite("Strict")
                .path(PATH);
    }
}
