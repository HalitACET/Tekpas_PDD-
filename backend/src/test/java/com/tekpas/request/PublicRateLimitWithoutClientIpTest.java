package com.tekpas.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Production while the client IP is off (application-prod.yml): unknown tokens are not blocked as a group, so
 * nobody can lock every supplier out by sending wrong tokens.
 */
@IntegrationTest
@TestPropertySource(properties = "tekpas.client-ip.trusted-proxies=-1")
class PublicRateLimitWithoutClientIpTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void unknownTokensDoNotBlockEveryone() {
        for (int i = 0; i < 15; i++) {
            MvcTestResult result = fixtures.mvc().get().uri("/api/v1/public/request")
                    .header("X-Request-Token", RequestTokens.generate())
                    .header("X-Forwarded-For", "203.0.113.5, 10.0.0.1").exchange();
            assertThat(result).hasStatus(404);
        }
    }
}
