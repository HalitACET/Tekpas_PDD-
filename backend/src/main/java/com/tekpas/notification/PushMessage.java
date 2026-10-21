package com.tekpas.notification;

import java.util.Map;

/**
 * One notification to one phone, in Expo's message form. {@code data.url} is the screen the app opens on a tap;
 * {@code channelId} is the Android channel the app creates.
 */
public record PushMessage(String to, String title, String body, Map<String, String> data, String sound,
        String priority, String channelId) {

    public static final String CHANNEL = "default";

    public static PushMessage of(String to, String title, String body, String url) {
        return new PushMessage(to, title, body, Map.of("url", url), "default", "high", CHANNEL);
    }
}
