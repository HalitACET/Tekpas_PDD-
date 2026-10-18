package com.tekpas.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Integration tests never touch a real storage: they get an in-memory one they can inspect. */
@TestConfiguration(proxyBeanMethods = false)
public class TestStorageConfiguration {

    @Bean
    @Primary
    FakeFileStorage testStorage() {
        return new FakeFileStorage();
    }

}
