package com.tekpas.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param cookieSecure       adds {@code Secure} to the refresh cookie; off only for local http
 * @param refreshReuseGrace  a used refresh token presented again within this window (e.g. two browser
 *                           tabs refreshing at once) is rejected without revoking its family
 * @param loginsPerMinute    login requests per minute from everyone together (docs/m12-plan.md §3)
 * @param failedLogins       failed logins per e-mail in {@code failedLoginWindow}; the next one is refused, even
 *                           with the right password
 * @param failedLoginsPerIp  failed logins per client IP in the window, when the client IP is known (ClientIp)
 */
@ConfigurationProperties("tekpas.auth")
public record AuthProperties(
        @DefaultValue("true") boolean cookieSecure,
        @DefaultValue("PT10S") Duration refreshReuseGrace,
        @DefaultValue("300") int loginsPerMinute,
        @DefaultValue("5") int failedLogins,
        @DefaultValue("20") int failedLoginsPerIp,
        @DefaultValue("PT15M") Duration failedLoginWindow) {
}
