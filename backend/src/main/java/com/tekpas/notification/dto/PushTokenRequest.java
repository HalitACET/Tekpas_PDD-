package com.tekpas.notification.dto;

import com.tekpas.notification.PushPlatform;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * @param token the Expo push token the app got from {@code getExpoPushTokenAsync}, e.g. {@code ExponentPushToken[…]}
 */
public record PushTokenRequest(
        @NotNull @Pattern(regexp = PushTokenRequest.TOKEN) String token,
        @NotNull PushPlatform platform) {

    /** Expo's token form; 200 characters at most (V2 {@code push_token.expo_token}). */
    public static final String TOKEN = "Expo(nent)?PushToken\\[[A-Za-z0-9_-]{1,170}\\]";
}
