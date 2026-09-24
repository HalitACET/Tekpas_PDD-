package com.tekpas.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param cookieSecure       adds {@code Secure} to the refresh cookie; off only for local http
 * @param refreshReuseGrace  a used refresh token presented again within this window (e.g. two browser
 *                           tabs refreshing at once) is rejected without revoking its family
 */
@ConfigurationProperties("tekpas.auth")
public record AuthProperties(
        @DefaultValue("true") boolean cookieSecure,
        @DefaultValue("PT10S") Duration refreshReuseGrace) {
}
