package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.AppUser;
import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

@IntegrationTest
class RefreshRotationTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    MutableClock clock;

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    @Test
    void rotationIssuesNewTokensAndMarksTheOldOneUsed() {
        String first = mobileLogin();

        MvcTestResult result = refresh(first);

        assertThat(result).hasStatusOk();
        String second = fixtures.body(result).path("refreshToken").asString();
        assertThat(second).isNotBlank().isNotEqualTo(first);
        assertThat(fixtures.body(result).path("accessToken").asString()).isNotBlank();
        assertThat(usedAt(first)).isNotNull();
        assertThat(usedAt(second)).isNull();
        assertThat(familyOf(second)).isEqualTo(familyOf(first));
    }

    /**
     * A login repeated while the server woke up (web, design v0.3.2 31): if the first, abandoned request was
     * processed too, the user has two families. The browser keeps the cookie of the answer it received, the
     * second; it refreshes normally. The first family is independent of it and simply expires.
     */
    @Test
    void aRepeatedLoginMakesAnIndependentFamilyAndTheLatestTokenRefreshes() {
        String abandoned = mobileLogin();
        String kept = mobileLogin();

        assertThat(familyOf(kept)).isNotEqualTo(familyOf(abandoned));
        MvcTestResult refreshed = refresh(kept);
        assertThat(refreshed).hasStatusOk();
        assertThat(refresh(refreshToken(refreshed))).hasStatusOk();
        assertThat(usedAt(abandoned)).isNull();
    }

    @Test
    void reuseWithinGraceIsRejectedButTheFamilySurvives() {
        String first = mobileLogin();
        String second = refreshToken(refresh(first));

        clock.advance(Duration.ofSeconds(5));

        assertInvalidRefresh(refresh(first));
        assertThat(refresh(second)).hasStatusOk();
    }

    @Test
    void reuseAfterGraceRevokesTheWholeFamily() {
        String first = mobileLogin();
        String second = refreshToken(refresh(first));

        clock.advance(Duration.ofSeconds(11));

        assertInvalidRefresh(refresh(first));
        assertInvalidRefresh(refresh(second));
    }

    /** The 401 must not roll back the revocation: the family is revoked in the database afterwards. */
    @Test
    void familyRevocationIsCommittedDespiteTheUnauthorizedResponse() {
        String first = mobileLogin();
        String second = refreshToken(refresh(first));
        UUID family = familyOf(first);

        clock.advance(Duration.ofSeconds(11));
        assertInvalidRefresh(refresh(first));

        List<Boolean> revoked = jdbc.queryForList(
                "SELECT revoked_at IS NOT NULL FROM refresh_token WHERE family_id = ?", Boolean.class, family);
        assertThat(revoked).hasSize(2).containsOnly(true);
        assertThat(familyOf(second)).isEqualTo(family);
    }

    @Test
    void expiredRefreshTokenIsRejected() {
        String token = mobileLogin();

        clock.advance(Duration.ofDays(31));

        assertInvalidRefresh(refresh(token));
    }

    @Test
    void unknownOrMissingRefreshTokenIsRejected() {
        assertInvalidRefresh(refresh("definitely-not-a-refresh-token"));
        assertInvalidRefresh(fixtures.mvc().post().uri("/api/v1/auth/refresh").exchange());
    }

    @Test
    void webClientRotatesThroughTheCookie() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        MvcTestResult login = fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.WEB);
        String firstCookie = cookieValue(login);

        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .cookie(new Cookie(RefreshCookies.NAME, firstCookie))
                .exchange();

        assertThat(result).hasStatusOk();
        assertThat(fixtures.body(result).has("refreshToken")).isFalse();
        String secondCookie = cookieValue(result);
        assertThat(secondCookie).isNotBlank().isNotEqualTo(firstCookie);
        assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE)).contains("HttpOnly", "SameSite=Strict");
    }

    /** Clients may send their expired access token along; refresh must still work. */
    @Test
    void refreshIgnoresAnExpiredOrInvalidBearerHeader() {
        String token = mobileLogin();

        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .header(HttpHeaders.AUTHORIZATION, "Bearer expired.or.garbage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + token + "\"}")
                .exchange();

        assertThat(result).hasStatusOk();
    }

    @Test
    void logoutAndLoginIgnoreABearerHeaderToo() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        assertThat(fixtures.mvc().post().uri("/api/v1/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, "Bearer garbage").exchange())
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(fixtures.mvc().post().uri("/api/v1/auth/login")
                .header(HttpHeaders.AUTHORIZATION, "Bearer garbage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + TestFixtures.PASSWORD
                        + "\",\"client\":\"MOBILE\"}")
                .exchange())
                .hasStatusOk();
    }

    @Test
    void protectedEndpointsStillRejectABadBearer() {
        assertThat(fixtures.mvc().get().uri("/api/v1/auth/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer garbage").exchange())
                .hasStatus(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void inactiveUsersCannotRefresh() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        String token = fixtures.login(user, ClientType.MOBILE).path("refreshToken").asString();
        jdbc.update("UPDATE app_user SET active = false WHERE id = ?", user.getId());

        assertInvalidRefresh(refresh(token));
    }

    private String mobileLogin() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        return fixtures.login(user, ClientType.MOBILE).path("refreshToken").asString();
    }

    private MvcTestResult refresh(String refreshToken) {
        return fixtures.mvc().post().uri("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + refreshToken + "\"}")
                .exchange();
    }

    private String refreshToken(MvcTestResult result) {
        assertThat(result).hasStatusOk();
        return fixtures.body(result).path("refreshToken").asString();
    }

    private void assertInvalidRefresh(MvcTestResult result) {
        assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(fixtures.body(result).path("type").asString())
                .isEqualTo("urn:tekpas:problem:invalid-refresh-token");
    }

    private Object usedAt(String rawToken) {
        return jdbc.queryForObject("SELECT used_at FROM refresh_token WHERE token_hash = ?", Object.class,
                RefreshTokenService.hash(rawToken));
    }

    private UUID familyOf(String rawToken) {
        return jdbc.queryForObject("SELECT family_id FROM refresh_token WHERE token_hash = ?", UUID.class,
                RefreshTokenService.hash(rawToken));
    }

    static String cookieValue(MvcTestResult result) {
        String header = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(header).startsWith(RefreshCookies.NAME + "=");
        return header.substring(RefreshCookies.NAME.length() + 1, header.indexOf(';'));
    }
}
