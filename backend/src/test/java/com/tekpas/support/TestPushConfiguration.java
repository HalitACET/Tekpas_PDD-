package com.tekpas.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Tests never call Expo's push service: they get a fake that records what would have been sent. */
@TestConfiguration(proxyBeanMethods = false)
public class TestPushConfiguration {

    @Bean
    @Primary
    FakeExpoPushClient testExpoPushClient() {
        return new FakeExpoPushClient();
    }
}
