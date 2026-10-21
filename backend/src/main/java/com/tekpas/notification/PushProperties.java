package com.tekpas.notification;

import java.time.Duration;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code PUSH_ENABLED}, {@code EXPO_ACCESS_TOKEN} (docs/m9-plan.md §4.3). Off unless switched on: nothing is sent to
 * Expo by default (local runs, tests).
 *
 * @param accessToken only needed when "enhanced security for push" is on in the EAS dashboard; never logged
 */
@ConfigurationProperties("tekpas.push")
public record PushProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("https://exp.host/--/api/v2/push/send") String url,
        @Nullable String accessToken,
        @DefaultValue("PT15S") Duration timeout) {

    public boolean hasAccessToken() {
        return accessToken != null && !accessToken.isBlank();
    }

    @Override
    public String toString() {
        return "PushProperties[enabled=" + enabled + ", url=" + url + ", accessToken=" + (hasAccessToken() ? "***" : "")
                + ", timeout=" + timeout + "]";
    }
}
