package com.tekpas.notification;

import java.util.Collections;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** {@code PUSH_ENABLED} is off: nothing leaves the server, every message counts as taken. */
class DisabledExpoPushClient implements ExpoPushClient {

    private static final Logger log = LoggerFactory.getLogger(DisabledExpoPushClient.class);

    @Override
    public List<PushTicket> send(List<PushMessage> messages) {
        log.debug("PUSH_ENABLED is off: {} notification(s) not sent", messages.size());
        return Collections.nCopies(messages.size(), PushTicket.ok());
    }
}
