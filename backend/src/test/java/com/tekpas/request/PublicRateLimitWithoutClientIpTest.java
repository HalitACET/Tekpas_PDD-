package com.tekpas.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Production while the client IP is off (application-prod.yml): unknown tokens of all clients share one
 * general counter, whatever X-Forwarded-For says.
 */
@IntegrationTest
@TestPropertySource(properties = "tekpas.client-ip.trusted-proxies=-1")
class PublicRateLimitWithoutClientIpTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void unknownTokensShareOneCounterWhateverTheForwardedFor() {
        for (int i = 0; i < PublicRequestController.GENERAL_INVALID_PER_MINUTE; i++) {
            MvcTestResult result = fixtures.mvc().get().uri("/api/v1/public/request")
                    .header("X-Request-Token", RequestTokens.generate())
                    .header("X-Forwarded-For", "198.51.100." + (i % 250 + 1) + ", 10.0.0.1").exchange();
            assertThat(result).hasStatus(404);
        }
        MvcTestResult blocked = fixtures.mvc().get().uri("/api/v1/public/request")
                .header("X-Request-Token", RequestTokens.generate())
                .header("X-Forwarded-For", "203.0.113.99, 10.0.0.1").exchange();
        assertThat(blocked).hasStatus(429);
    }
}
