package com.tekpas.common;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.auth.ClientType;
import com.tekpas.company.AppUser;
import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * K18 in production: no CORS origins are configured and the web app's proxy forwards the browser's
 * Origin header (e.g. https://kozapass.vercel.app). Those requests must work, not be rejected as CORS.
 */
@IntegrationTest
@TestPropertySource(properties = "tekpas.cors.allowed-origins=")
class ProxiedOriginTest {

    private static final String WEB_ORIGIN = "https://kozapass.vercel.app";

    @Autowired
    TestFixtures fixtures;

    @Test
    void loginThroughTheProxyWithAnOriginHeaderSucceeds() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/auth/login")
                .header(HttpHeaders.ORIGIN, WEB_ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + TestFixtures.PASSWORD
                        + "\",\"client\":\"" + ClientType.WEB + "\"}")
                .exchange();

        assertThat(result).hasStatusOk();
        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
    }

    @Test
    void refreshWithAnOriginHeaderIsNotACorsRejection() {
        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .header(HttpHeaders.ORIGIN, WEB_ORIGIN)
                .exchange();

        // No cookie: the auth answer (401 problem), not a CORS 403.
        assertThat(result.getResponse().getStatus()).isEqualTo(401);
        assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:invalid-refresh-token");
    }

    @Test
    void foreignSitesStillGetNoCorsPermission() {
        MvcTestResult result = fixtures.mvc().options().uri("/api/v1/auth/login")
                .header(HttpHeaders.ORIGIN, "https://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange();

        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
        assertThat(result.getResponse().getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isNull();
    }
}
