package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.AppUser;
import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import jakarta.servlet.http.Cookie;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** "Remember me" off: session cookies only, kept that way across refresh rotations. */
@IntegrationTest
class RememberMeTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void omittedRememberMeGivesPersistentCookieAndClearsModeCookie() {
        MvcTestResult login = login(null);

        assertThat(login).hasStatusOk();
        assertThat(cookie(login, RefreshCookies.NAME)).contains("Max-Age=2592000", "HttpOnly", "SameSite=Strict");
        assertThat(cookie(login, RefreshCookies.MODE_NAME)).contains("Max-Age=0");
    }

    @Test
    void rememberMeTrueGivesPersistentCookie() {
        assertThat(cookie(login(true), RefreshCookies.NAME)).contains("Max-Age=2592000");
    }

    @Test
    void rememberMeFalseGivesSessionCookies() {
        MvcTestResult login = login(false);

        assertThat(login).hasStatusOk();
        assertThat(cookie(login, RefreshCookies.NAME))
                .contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth")
                .doesNotContain("Max-Age", "Expires");
        assertThat(cookie(login, RefreshCookies.MODE_NAME))
                .startsWith(RefreshCookies.MODE_NAME + "=session")
                .contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth")
                .doesNotContain("Max-Age", "Expires");
    }

    @Test
    void sessionModeSurvivesRefresh() {
        MvcTestResult login = login(false);

        MvcTestResult refresh = fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .cookie(new Cookie(RefreshCookies.NAME, value(cookie(login, RefreshCookies.NAME))),
                        new Cookie(RefreshCookies.MODE_NAME, RefreshCookies.MODE_SESSION))
                .exchange();

        assertThat(refresh).hasStatusOk();
        assertThat(cookie(refresh, RefreshCookies.NAME)).doesNotContain("Max-Age", "Expires");
        assertThat(cookie(refresh, RefreshCookies.MODE_NAME)).startsWith(RefreshCookies.MODE_NAME + "=session");
    }

    @Test
    void persistentModeSurvivesRefresh() {
        MvcTestResult login = login(true);

        MvcTestResult refresh = fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .cookie(new Cookie(RefreshCookies.NAME, value(cookie(login, RefreshCookies.NAME))))
                .exchange();

        assertThat(refresh).hasStatusOk();
        assertThat(cookie(refresh, RefreshCookies.NAME)).contains("Max-Age=2592000");
    }

    @Test
    void logoutClearsBothCookies() {
        MvcTestResult logout = fixtures.mvc().post().uri("/api/v1/auth/logout").exchange();

        assertThat(logout).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(cookie(logout, RefreshCookies.NAME)).contains("Max-Age=0");
        assertThat(cookie(logout, RefreshCookies.MODE_NAME)).contains("Max-Age=0");
    }

    @Test
    void mobileIgnoresRememberMe() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        MvcTestResult login = fixtures.mvc().post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + TestFixtures.PASSWORD
                        + "\",\"client\":\"MOBILE\",\"rememberMe\":false}")
                .exchange();

        assertThat(login).hasStatusOk();
        assertThat(login.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
        assertThat(fixtures.body(login).path("refreshToken").asString()).isNotBlank();
    }

    private MvcTestResult login(Boolean rememberMe) {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        String flag = rememberMe == null ? "" : ",\"rememberMe\":" + rememberMe;
        return fixtures.mvc().post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + TestFixtures.PASSWORD
                        + "\",\"client\":\"WEB\"" + flag + "}")
                .exchange();
    }

    private static String cookie(MvcTestResult result, String name) {
        List<String> cookies = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE);
        return cookies.stream().filter(c -> c.startsWith(name + "=")).findFirst()
                .orElseThrow(() -> new AssertionError("no " + name + " cookie in " + cookies));
    }

    private static String value(String setCookie) {
        return setCookie.substring(setCookie.indexOf('=') + 1, setCookie.indexOf(';'));
    }
}
