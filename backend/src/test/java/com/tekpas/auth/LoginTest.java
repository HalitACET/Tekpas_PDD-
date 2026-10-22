package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.AppUser;
import com.tekpas.company.AppUserRepository;
import com.tekpas.company.Company;
import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

@IntegrationTest
class LoginTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    AppUserRepository users;

    @Test
    void validCredentialsReturnAccessTokenAndUserSummary() {
        Company company = fixtures.company();
        AppUser user = fixtures.user(company, UserRole.ADMIN);

        MvcTestResult result = fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.MOBILE);

        assertThat(result).hasStatusOk();
        JsonNode body = fixtures.body(result);
        assertThat(body.path("accessToken").asString()).isNotBlank();
        assertThat(body.path("tokenType").asString()).isEqualTo("Bearer");
        assertThat(body.path("expiresIn").asLong()).isEqualTo(900);
        assertThat(body.path("user").path("id").asString()).isEqualTo(user.getId().toString());
        assertThat(body.path("user").path("role").asString()).isEqualTo("ADMIN");
        assertThat(body.path("user").path("company").path("id").asString()).isEqualTo(company.getId().toString());
    }

    @Test
    void emailIsMatchedCaseInsensitively() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        assertThat(fixtures.loginRequest(user.getEmail().toUpperCase(), TestFixtures.PASSWORD,
                ClientType.MOBILE)).hasStatusOk();
    }

    @Test
    void wrongPasswordAndUnknownEmailGetTheSameProblem() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        MvcTestResult wrongPassword = fixtures.loginRequest(user.getEmail(), "wrong-password", ClientType.WEB);
        MvcTestResult unknownEmail = fixtures.loginRequest("nobody@test.example", "wrong-password", ClientType.WEB);

        assertThat(wrongPassword).hasStatus(HttpStatus.UNAUTHORIZED)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(fixtures.body(wrongPassword).path("type").asString())
                .isEqualTo("urn:tekpas:problem:invalid-credentials");
        assertThat(unknownEmail).hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(body(unknownEmail)).isEqualTo(body(wrongPassword));
        assertThat(wrongPassword.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void inactiveUserCannotLogInAndGetsTheSameProblem() {
        Company company = fixtures.company();
        AppUser inactive = fixtures.inactiveUser(company);
        AppUser active = fixtures.user(company, UserRole.OWNER);

        MvcTestResult inactiveResult = fixtures.loginRequest(inactive.getEmail(), TestFixtures.PASSWORD,
                ClientType.WEB);
        MvcTestResult wrongPassword = fixtures.loginRequest(active.getEmail(), "wrong-password", ClientType.WEB);

        assertThat(inactiveResult).hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(body(inactiveResult)).isEqualTo(body(wrongPassword));
    }

    @Test
    void successfulLoginUpdatesLastLoginAt() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        assertThat(user.getLastLoginAt()).isNull();

        fixtures.login(user, ClientType.MOBILE);

        assertThat(users.findById(user.getId()).orElseThrow().getLastLoginAt()).isNotNull();
    }

    @Test
    void webLoginSetsHttpOnlyStrictCookieAndKeepsTokenOutOfBody() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        MvcTestResult result = fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.WEB);

        assertThat(result).hasStatusOk();
        String cookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(cookie)
                .startsWith(RefreshCookies.NAME + "=")
                .contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth", "Max-Age=2592000")
                .doesNotContain("Secure"); // test profile = local http; prod sets Secure
        assertThat(fixtures.body(result).has("refreshToken")).isFalse();
    }

    @Test
    void mobileLoginReturnsRefreshTokenInBodyAndSetsNoCookie() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        MvcTestResult result = fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.MOBILE);

        assertThat(result).hasStatusOk();
        assertThat(fixtures.body(result).path("refreshToken").asString()).hasSizeGreaterThanOrEqualTo(43);
        assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void blankEmailIsAValidationProblemNamingTheField() {
        MvcTestResult result = fixtures.loginRequest("", TestFixtures.PASSWORD, ClientType.WEB);

        assertThat(result).hasStatus(HttpStatus.BAD_REQUEST)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        JsonNode body = fixtures.body(result);
        assertThat(body.path("type").asString()).isEqualTo("urn:tekpas:problem:validation");
        assertThat(body.path("errors").valueStream()
                .filter(e -> e.path("field").asString().equals("email"))
                .map(e -> e.path("code").asString()))
                .contains("NotBlank");
    }

    @Test
    void unknownClientTypeIsABadRequestProblem() {
        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@test.example\",\"password\":\"x\",\"client\":\"FRIDGE\"}")
                .exchange();

        assertThat(result).hasStatus(HttpStatus.BAD_REQUEST)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:bad-request");
    }

    @Test
    void afterFiveFailuresTheEmailIsRefusedEvenWithTheRightPasswordAndOthersAreNot() {
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);
        AppUser other = fixtures.user(fixtures.company(), UserRole.OWNER);
        for (int i = 0; i < 5; i++) {
            assertThat(fixtures.loginRequest(user.getEmail(), "wrong-password", ClientType.WEB))
                    .hasStatus(HttpStatus.UNAUTHORIZED);
        }

        MvcTestResult refused = fixtures.loginRequest(user.getEmail().toUpperCase(), TestFixtures.PASSWORD,
                ClientType.WEB);

        assertThat(refused).hasStatus(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(fixtures.body(refused).path("type").asString()).isEqualTo("urn:tekpas:problem:too-many-requests");
        assertThat(Long.parseLong(refused.getResponse().getHeader(HttpHeaders.RETRY_AFTER))).isBetween(1L, 900L);
        assertThat(fixtures.loginRequest(other.getEmail(), TestFixtures.PASSWORD, ClientType.WEB)).hasStatusOk();
    }

    @Test
    void anUnknownEmailIsLimitedTheSameWaySoTheAnswerTellsNothing() {
        String unknown = "nobody-" + UUID.randomUUID() + "@test.example";
        for (int i = 0; i < 5; i++) {
            assertThat(fixtures.loginRequest(unknown, "wrong-password", ClientType.WEB))
                    .hasStatus(HttpStatus.UNAUTHORIZED);
        }

        assertThat(fixtures.loginRequest(unknown, "wrong-password", ClientType.WEB))
                .hasStatus(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void aKnownClientIpIsLimitedAcrossEmails() {
        // One proxy is trusted in tests: "<client>, <proxy>".
        String forwarded = "198.51.100." + (int) (Math.random() * 250 + 1) + ", 10.0.0.1";
        for (int i = 0; i < 20; i++) {
            assertThat(loginFrom(forwarded, "someone-" + i + "-" + UUID.randomUUID() + "@test.example"))
                    .hasStatus(HttpStatus.UNAUTHORIZED);
        }
        AppUser user = fixtures.user(fixtures.company(), UserRole.OWNER);

        assertThat(loginFrom(forwarded, user.getEmail())).hasStatus(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(fixtures.loginRequest(user.getEmail(), TestFixtures.PASSWORD, ClientType.WEB)).hasStatusOk();
    }

    private MvcTestResult loginFrom(String forwardedFor, String email) {
        return fixtures.mvc().post().uri("/api/v1/auth/login").header("X-Forwarded-For", forwardedFor)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"wrong-password\",\"client\":\"WEB\"}")
                .exchange();
    }

    /** The response body without its request id, which differs between any two requests. */
    private static String body(MvcTestResult result) {
        return new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8)
                .replaceFirst(",?\"requestId\":\"[^\"]*\"", "");
    }
}
