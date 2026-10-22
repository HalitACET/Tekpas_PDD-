package com.tekpas.auth;

import com.tekpas.common.web.RateLimiter;
import java.time.Duration;
import java.util.Locale;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Login attempt limits (M12 T1, docs/m12-plan.md §3): failed logins per e-mail and, when the client IP is known, per
 * IP; plus one counter for all logins. An unknown e-mail counts like a known one, so the answer tells nothing about
 * which accounts exist.
 */
@Component
class LoginThrottle {

    private static final String ALL = "login";
    private static final String BY_EMAIL = "login-failed-email";
    private static final String BY_IP = "login-failed-ip";

    private final RateLimiter limiter;
    private final AuthProperties properties;

    LoginThrottle(RateLimiter limiter, AuthProperties properties) {
        this.limiter = limiter;
        this.properties = properties;
    }

    /** Before checking the password: 429 when this e-mail or IP used up its failures, or everyone the minute. */
    void before(String email, @Nullable String ip) {
        limiter.hit(ALL, "all", properties.loginsPerMinute(), Duration.ofMinutes(1));
        limiter.check(BY_EMAIL, key(email), properties.failedLogins(), properties.failedLoginWindow());
        if (ip != null) {
            limiter.check(BY_IP, ip, properties.failedLoginsPerIp(), properties.failedLoginWindow());
        }
    }

    /** A wrong password, an unknown e-mail or an inactive user. */
    void failed(String email, @Nullable String ip) {
        limiter.hit(BY_EMAIL, key(email), Integer.MAX_VALUE, properties.failedLoginWindow());
        if (ip != null) {
            limiter.hit(BY_IP, ip, Integer.MAX_VALUE, properties.failedLoginWindow());
        }
    }

    private static String key(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
