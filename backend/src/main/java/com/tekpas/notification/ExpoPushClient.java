package com.tekpas.notification;

import java.util.List;

/**
 * Expo's push service (docs/m9-plan.md §4.3). At most {@link #MAX_BATCH} messages a call; the tickets come back in
 * the order of the messages. Throws {@link PushUnavailableException} when the service cannot take them now (the job
 * retries) and {@link IllegalStateException} for a request it will never take.
 */
public interface ExpoPushClient {

    int MAX_BATCH = 100;

    List<PushTicket> send(List<PushMessage> messages);
}
