package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class JwtPropertiesTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfig.class);

    @Test
    void secretShorterThan32BytesStopsTheContext() {
        runner.withPropertyValues("tekpas.jwt.secret=too-short-secret")
                .run(context -> assertThat(context).hasFailed()
                        .getFailure().rootCause().hasMessageContaining("at least 32 bytes"));
    }

    @Test
    void missingSecretStopsTheContext() {
        runner.run(context -> assertThat(context).hasFailed());
    }

    @Test
    void secretOf32BytesStartsWithDefaultTtls() {
        runner.withPropertyValues("tekpas.jwt.secret=0123456789abcdef0123456789abcdef")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    JwtProperties properties = context.getBean(JwtProperties.class);
                    assertThat(properties.accessTtl().toMinutes()).isEqualTo(15);
                    assertThat(properties.refreshTtl().toDays()).isEqualTo(30);
                    assertThat(properties.toString()).doesNotContain("0123456789abcdef");
                });
    }

    @Configuration
    @EnableConfigurationProperties(JwtProperties.class)
    static class PropertiesConfig {
    }
}
