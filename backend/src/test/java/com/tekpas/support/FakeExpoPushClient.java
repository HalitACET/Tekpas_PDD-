package com.tekpas.support;

import com.tekpas.notification.ExpoPushClient;
import com.tekpas.notification.PushMessage;
import com.tekpas.notification.PushTicket;
import com.tekpas.notification.PushUnavailableException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Expo's push service in tests: records every call; tokens can be marked gone, a call can be made to fail. */
public class FakeExpoPushClient implements ExpoPushClient {

    private final List<List<PushMessage>> calls = new ArrayList<>();
    private final Set<String> gone = new HashSet<>();
    private int failures;

    @Override
    public synchronized List<PushTicket> send(List<PushMessage> messages) {
        if (failures > 0) {
            failures--;
            throw new PushUnavailableException("Expo push answered 503");
        }
        calls.add(List.copyOf(messages));
        return messages.stream()
                .map(m -> gone.contains(m.to()) ? new PushTicket("error", PushTicket.DEVICE_NOT_REGISTERED)
                        : PushTicket.ok())
                .toList();
    }

    /** The messages sent to these tokens, in order, across all calls. */
    public synchronized List<PushMessage> sentTo(Set<String> tokens) {
        return calls.stream().flatMap(List::stream).filter(m -> tokens.contains(m.to())).toList();
    }

    public synchronized List<List<PushMessage>> calls() {
        return List.copyOf(calls);
    }

    public synchronized void markGone(String token) {
        gone.add(token);
    }

    public synchronized void failNext(int times) {
        failures = times;
    }

    public synchronized void reset() {
        calls.clear();
        gone.clear();
        failures = 0;
    }
}
