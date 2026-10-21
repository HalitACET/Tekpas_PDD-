package com.tekpas.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/** Expo's push service when {@code PUSH_ENABLED} is on, otherwise nothing is sent. */
@Configuration
public class PushConfig {

    private static final Logger log = LoggerFactory.getLogger(PushConfig.class);

    @Bean
    ExpoPushClient expoPushClient(PushProperties properties, ObjectMapper json) {
        if (!properties.enabled()) {
            return new DisabledExpoPushClient();
        }
        if (!properties.url().startsWith("https://")) {
            throw new IllegalStateException("tekpas.push.url must be an https:// URL");
        }
        log.warn("Push notifications are ON: OWNER and ADMIN phones are notified through Expo's push service");
        return new HttpExpoPushClient(properties, json);
    }
}
