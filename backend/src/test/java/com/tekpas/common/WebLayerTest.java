package com.tekpas.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Cross-cutting HTTP behavior: CORS and error format outside the auth endpoints. */
@IntegrationTest
class WebLayerTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void corsPreflightFromAllowedOriginAllowsCredentials() {
        MvcTestResult result = preflight("http://localhost:3000");

        assertThat(result).hasStatusOk();
        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .isEqualTo("http://localhost:3000");
        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isEqualTo("true");
    }

    @Test
    void corsPreflightFromUnknownOriginIsRejected() {
        MvcTestResult result = preflight("https://evil.example");

        assertThat(result).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
    }

    @Test
    void unknownRouteIsNotFoundProblem() {
        MvcTestResult result = fixtures.mvc().get().uri("/api/v1/does-not-exist")
                .header(HttpHeaders.AUTHORIZATION, fixtures.tenant().bearer())
                .exchange();

        assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:not-found");
    }

    private MvcTestResult preflight(String origin) {
        return fixtures.mvc().options().uri("/api/v1/auth/login")
                .header(HttpHeaders.ORIGIN, origin)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
                .exchange();
    }
}
