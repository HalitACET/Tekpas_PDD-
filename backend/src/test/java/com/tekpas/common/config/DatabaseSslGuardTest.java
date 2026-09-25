package com.tekpas.common.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DatabaseSslGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require",
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?connectTimeout=10&sslmode=verify-full",
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=verify-ca&connectTimeout=10"
    })
    void acceptsUrlsThatRequireTls(String url) {
        assertThatCode(() -> DatabaseSslGuard.check(url)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb",
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=prefer",
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=disable",
        "jdbc:postgresql://ep-x.eu-central-1.aws.neon.tech/neondb?xsslmode=require"
    })
    void rejectsUrlsWithoutRequiredTls(String url) {
        assertThatThrownBy(() -> DatabaseSslGuard.check(url))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("sslmode=require");
    }

    @Test
    void guardRunsOnStartup() {
        assertThatThrownBy(() -> new DatabaseSslGuard("jdbc:postgresql://localhost/db").afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }
}
