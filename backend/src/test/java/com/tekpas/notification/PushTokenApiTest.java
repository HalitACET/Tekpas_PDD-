package com.tekpas.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** The phones that receive a user's notifications (docs/m9-plan.md §4.2). */
@IntegrationTest
class PushTokenApiTest {

    static final String TOKENS = "/api/v1/me/push-tokens";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    static String token() {
        return "ExponentPushToken[" + UUID.randomUUID().toString().replace("-", "").substring(0, 22) + "]";
    }

    MvcTestResult register(Tenant tenant, Object body) {
        return fixtures.mvc().put().uri(TOKENS).header(HttpHeaders.AUTHORIZATION, tenant.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body instanceof String raw ? raw : toJson(body)).exchange();
    }

    static String toJson(Object body) {
        @SuppressWarnings("unchecked")
        Map<String, String> map = (Map<String, String>) body;
        return "{\"token\":\"" + map.get("token") + "\",\"platform\":\"" + map.get("platform") + "\"}";
    }

    MvcTestResult remove(Tenant tenant, String token) {
        return fixtures.mvc().delete().uri(TOKENS).queryParam("token", token)
                .header(HttpHeaders.AUTHORIZATION, tenant.bearer()).exchange();
    }

    List<Map<String, Object>> rows(String token) {
        return jdbc.queryForList("SELECT user_id, platform FROM push_token WHERE expo_token = ?", token);
    }

    @Test
    void registersATokenOnceAndMovesItToWhoeverSignsInOnThePhone() {
        Tenant elif = fixtures.tenant();
        String token = token();

        assertThat(register(elif, Map.of("token", token, "platform", "ANDROID"))).hasStatus(204);
        assertThat(register(elif, Map.of("token", token, "platform", "ANDROID"))).hasStatus(204);
        assertThat(rows(token)).singleElement()
                .satisfies(row -> assertThat(row.get("user_id")).isEqualTo(elif.user().getId()));

        Tenant other = fixtures.tenant(UserRole.ADMIN);
        assertThat(register(other, Map.of("token", token, "platform", "IOS"))).hasStatus(204);
        assertThat(rows(token)).singleElement().satisfies(row -> {
            assertThat(row.get("user_id")).isEqualTo(other.user().getId());
            assertThat(row.get("platform")).isEqualTo("IOS");
        });
    }

    @Test
    void removesOnlyTheUsersOwnToken() {
        Tenant elif = fixtures.tenant();
        String token = token();
        register(elif, Map.of("token", token, "platform", "ANDROID"));

        assertThat(remove(fixtures.member(elif, UserRole.ADMIN), token)).hasStatus(404);
        assertThat(rows(token)).hasSize(1);

        assertThat(remove(elif, token)).hasStatus(204);
        assertThat(rows(token)).isEmpty();
        assertThat(remove(elif, token)).hasStatus(404);
    }

    @Test
    void refusesWhatIsNotAnExpoTokenAndSupplierUsers() {
        Tenant elif = fixtures.tenant();

        MvcTestResult wrong = register(elif, Map.of("token", "fcm:abc", "platform", "ANDROID"));
        assertThat(wrong).hasStatus(400);
        assertThat(fixtures.body(wrong).path("errors").get(0).path("field").asString()).isEqualTo("token");
        assertThat(register(elif, "{\"token\":\"" + token() + "\"}")).hasStatus(400);
        assertThat(register(elif, "{\"token\":\"" + token() + "\",\"platform\":\"WINDOWS\"}")).hasStatus(400);

        Tenant supplier = fixtures.member(elif, UserRole.SUPPLIER);
        assertThat(register(supplier, Map.of("token", token(), "platform", "ANDROID"))).hasStatus(403);
        assertThat(fixtures.mvc().put().uri(TOKENS).contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of("token", token(), "platform", "ANDROID"))).exchange()).hasStatus(401);
    }
}
