package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.AppUser;
import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

@IntegrationTest
class LogoutTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void mobileLogoutRevokesTheRefreshToken() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        String refreshToken = fixtures.login(user, ClientType.MOBILE).path("refreshToken").asString();
        String body = "{\"refreshToken\":\"" + refreshToken + "\"}";

        assertThat(fixtures.mvc().post().uri("/api/v1/auth/logout")
                .contentType(MediaType.APPLICATION_JSON).content(body).exchange())
                .hasStatus(HttpStatus.NO_CONTENT);

        assertThat(fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON).content(body).exchange())
                .hasStatus(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void webLogoutRevokesTheCookieTokenAndClearsTheCookie() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        MvcTestResult login = fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.WEB);
        Cookie cookie = new Cookie(RefreshCookies.NAME, RefreshRotationTest.cookieValue(login));

        MvcTestResult logout = fixtures.mvc().post().uri("/api/v1/auth/logout").cookie(cookie).exchange();

        assertThat(logout).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(logout.getResponse().getHeader(HttpHeaders.SET_COOKIE))
                .startsWith(RefreshCookies.NAME + "=;")
                .contains("Max-Age=0", "Path=/api/v1/auth", "HttpOnly");
        assertThat(fixtures.mvc().post().uri("/api/v1/auth/refresh").cookie(cookie).exchange())
                .hasStatus(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void logoutIsIdempotentWithoutOrWithUnknownToken() {
        assertThat(fixtures.mvc().post().uri("/api/v1/auth/logout").exchange())
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(fixtures.mvc().post().uri("/api/v1/auth/logout")
                .contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"unknown\"}").exchange())
                .hasStatus(HttpStatus.NO_CONTENT);
    }
}
