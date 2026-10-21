package com.tekpas.notification;

/** Expo did not take the messages now (no answer, 429, 5xx); worth another try. */
public class PushUnavailableException extends RuntimeException {

    public PushUnavailableException(String message) {
        super(message);
    }
}
