package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.common.security.JwtClaims;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

@IntegrationTest
class AccessTokenTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    MutableClock clock;

    @Autowired
    JwtEncoder jwtEncoder;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    @Test
    void missingTokenIsUnauthorizedProblem() {
        assertUnauthorizedProblem(fixtures.mvc().get().uri("/api/v1/auth/me").exchange());
    }

    @Test
    void expiredTokenIsUnauthorizedProblem() {
        Tenant tenant = fixtures.tenant();
        assertThat(me(tenant.accessToken())).hasStatusOk();

        clock.advance(Duration.ofMinutes(16));

        assertUnauthorizedProblem(me(tenant.accessToken()));
    }

    @Test
    void tokenSignedWithAnotherKeyIsUnauthorizedProblem() {
        Tenant tenant = fixtures.tenant();
        JwtEncoder foreignEncoder = NimbusJwtEncoder.withSecretKey(new SecretKeySpec(
                        "some-other-secret-that-is-long-enough-123".getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
                .algorithm(MacAlgorithm.HS256)
                .build();

        assertUnauthorizedProblem(me(sign(foreignEncoder, tenant, JwtClaims.ISSUER)));
    }

    @Test
    void tamperedPayloadIsUnauthorizedProblem() {
        String[] parts = fixtures.tenant().accessToken().split("\\.");
        String forgedPayload = sign(jwtEncoder, fixtures.tenant(), JwtClaims.ISSUER).split("\\.")[1];

        assertUnauthorizedProblem(me(parts[0] + "." + forgedPayload + "." + parts[2]));
    }

    @Test
    void tokenFromAnotherIssuerIsUnauthorizedProblem() {
        Tenant tenant = fixtures.tenant();

        assertThat(me(sign(jwtEncoder, tenant, JwtClaims.ISSUER))).hasStatusOk();
        assertUnauthorizedProblem(me(sign(jwtEncoder, tenant, "someone-else")));
    }

    @Test
    void garbageTokenIsUnauthorizedProblem() {
        assertUnauthorizedProblem(me("not-a-jwt"));
    }

    private MvcTestResult me(String accessToken) {
        return fixtures.mvc().get().uri("/api/v1/auth/me")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .exchange();
    }

    private static String sign(JwtEncoder encoder, Tenant tenant, String issuer) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(tenant.user().getId().toString())
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofMinutes(15)))
                .claim(JwtClaims.COMPANY_ID, tenant.company().getId().toString())
                .claim(JwtClaims.ROLE, "OWNER")
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    private void assertUnauthorizedProblem(MvcTestResult result) {
        assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED)
                .hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(result.getResponse().getHeader(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer");
        assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:unauthorized");
        assertThat(fixtures.body(result).path("status").asInt()).isEqualTo(401);
    }
}
