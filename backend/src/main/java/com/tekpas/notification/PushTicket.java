package com.tekpas.notification;

import org.jspecify.annotations.Nullable;

/**
 * Expo's answer for one message, in the order they were sent: "ok" means Expo took it, not that the phone got it.
 * {@code error} is Expo's code, e.g. DeviceNotRegistered: the app was removed or the token is no longer valid.
 */
public record PushTicket(String status, @Nullable String error) {

    public static final String DEVICE_NOT_REGISTERED = "DeviceNotRegistered";

    public static PushTicket ok() {
        return new PushTicket("ok", null);
    }

    public boolean deviceGone() {
        return DEVICE_NOT_REGISTERED.equals(error);
    }
}
