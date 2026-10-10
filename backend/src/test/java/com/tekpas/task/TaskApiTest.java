package com.tekpas.task;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** GET /tasks (design v0.4 48a): what waits for the manufacturer, in three groups. */
@IntegrationTest
class TaskApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @Autowired
    ObjectMapper json;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    String batch(Tenant tenant) {
        String productId = fixtures.body(fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Tişört", "category", "T_SHIRT"))).path("id").asString();
        return fixtures.body(fixtures.post(tenant, "/api/v1/batches", Map.of("productId", productId, "quantity", 10)))
                .path("id").asString();
    }

    String step(Tenant tenant, String batchId, String type) {
        return fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId + "/chain")).path("steps").valueStream()
                .filter(s -> s.path("stepType").asString().equals(type)).findFirst().orElseThrow().path("id").asString();
    }

    String assign(Tenant tenant, String stepId, String type) {
        String supplierId = fixtures.body(fixtures.post(tenant, "/api/v1/suppliers", Map.of("name", type + " "
                + UUID.randomUUID().toString().substring(0, 4), "type", type, "city", "Bursa"))).path("id").asString();
        assertThat(fixtures.patch(tenant, "/api/v1/steps/" + stepId, Map.of("supplierId", supplierId))).hasStatusOk();
        return supplierId;
    }

    String token(Tenant tenant, String stepId) {
        return fixtures.body(fixtures.post(tenant, "/api/v1/steps/" + stepId + "/requests", Map.of())).path("token")
                .asString();
    }

    MvcTestResult submit(String token, Map<String, Object> data) {
        return fixtures.mvc().post().uri("/api/v1/public/request/submit").header("X-Request-Token", token)
                .header("X-Forwarded-For", "203.0.113." + (int) (Math.random() * 250 + 1) + ", 10.0.0.1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("data", data, "submitterName", "Selin Arslan"))).exchange();
    }

    JsonNode tasks(Tenant tenant) {
        MvcTestResult result = fixtures.get(tenant, "/api/v1/tasks");
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    /** After the clock moved on, the access token has expired: a fresh login of the same company. */
    Tenant fresh(Tenant tenant) {
        return fixtures.member(tenant, UserRole.OWNER);
    }

    static List<String> kinds(JsonNode group) {
        return group.valueStream().map(t -> t.path("kind").asString()).toList();
    }

    static final Map<String, Object> YARN = Map.of("fiberComposition", List.of(Map.of("fiber", "COTTON",
            "percent", 100)), "originCountry", "TR", "yarnCount", "Ne 30/1");

    @Test
    void aNewBatchListsItsMissingOriginAndSuppliers() {
        Tenant tenant = fixtures.tenant();
        String batchId = batch(tenant);

        JsonNode tasks = tasks(tenant);

        assertThat(kinds(tasks.path("incomplete"))).containsExactly("ORIGIN_MISSING", "STEP_UNASSIGNED",
                "STEP_UNASSIGNED", "STEP_UNASSIGNED", "STEP_UNASSIGNED");
        assertThat(tasks.path("incomplete").get(1).path("stepType").asString()).isEqualTo("YARN");
        assertThat(tasks.path("incomplete").get(0).path("batchId").asString()).isEqualTo(batchId);
        assertThat(tasks.path("review").isEmpty()).isTrue();
        assertThat(tasks.path("total").asInt()).isEqualTo(5);
    }

    @Test
    void aBatchWithoutAChainIsATask() {
        Tenant tenant = fixtures.tenant();
        String batchId = batch(tenant);
        jdbc.update("DELETE FROM supply_step WHERE batch_id = ?::uuid", batchId);

        JsonNode tasks = tasks(tenant);

        assertThat(kinds(tasks.path("incomplete"))).containsExactly("NO_CHAIN");
        assertThat(tasks.path("incomplete").get(0).path("stepId").isNull()).isTrue();
    }

    @Test
    void submittedDataWaitsForOwnersAndAdminsOnly() {
        Tenant tenant = fixtures.tenant();
        String yarn = step(tenant, batch(tenant), "YARN");
        assign(tenant, yarn, "YARN");
        assertThat(submit(token(tenant, yarn), YARN)).hasStatusOk();

        JsonNode review = tasks(tenant).path("review");

        assertThat(kinds(review)).containsExactly("STEP_SUBMITTED");
        assertThat(review.get(0).path("submitterName").asString()).isEqualTo("Selin Arslan");
        assertThat(review.get(0).path("filledFields").asInt()).isEqualTo(3);
        assertThat(review.get(0).path("supplierName").asString()).startsWith("YARN ");
        assertThat(tasks(fixtures.member(tenant, UserRole.ADMIN)).path("review").size()).isEqualTo(1);
        assertThat(tasks(fixtures.member(tenant, UserRole.EDITOR)).path("review").isEmpty()).isTrue();
    }

    @Test
    void linksNearTheirDeadlineAndExpiredOnesNeedFollowingUp() {
        Tenant tenant = fixtures.tenant();
        String batchId = batch(tenant);
        String yarn = step(tenant, batchId, "YARN");
        String fabric = step(tenant, batchId, "FABRIC");
        assign(tenant, yarn, "YARN");
        assign(tenant, fabric, "FABRIC");
        token(tenant, yarn);
        assertThat(kinds(tasks(tenant).path("followUp"))).isEmpty();

        clock.advance(Duration.ofDays(4));
        token(fresh(tenant), fabric);
        clock.advance(Duration.ofDays(2).plusHours(1));

        // YARN: 6 days and 1 hour old (deadline in 23 h); FABRIC: 2 days and 1 hour old.
        assertThat(kinds(tasks(fresh(tenant)).path("followUp"))).containsExactly("LINK_EXPIRING");
        clock.advance(Duration.ofDays(1));
        JsonNode followUp = tasks(fresh(tenant)).path("followUp");
        assertThat(kinds(followUp)).containsExactly("LINK_EXPIRED");
        assertThat(followUp.get(0).path("stepType").asString()).isEqualTo("YARN");
        assertThat(followUp.get(0).path("openCount").asInt()).isZero();
    }

    @Test
    void aCorrectionWithoutANewLinkComesFirst() {
        Tenant tenant = fixtures.tenant();
        String batchId = batch(tenant);
        String yarn = step(tenant, batchId, "YARN");
        String fabric = step(tenant, batchId, "FABRIC");
        assign(tenant, yarn, "YARN");
        assign(tenant, fabric, "FABRIC");
        assertThat(submit(token(tenant, yarn), YARN)).hasStatusOk();
        assertThat(fixtures.post(tenant, "/api/v1/steps/" + yarn + "/reject", Map.of("reason", "Kontrol edin.")))
                .hasStatusOk();
        token(tenant, fabric);
        clock.advance(Duration.ofDays(6));
        Tenant later = fresh(tenant);

        JsonNode followUp = tasks(later).path("followUp");

        assertThat(kinds(followUp)).containsExactly("CORRECTION_NO_LINK", "LINK_EXPIRING");
        token(later, yarn);
        assertThat(kinds(tasks(later).path("followUp"))).containsExactly("LINK_EXPIRING");
    }

    @Test
    void publishedBatchesAndOtherCompaniesAreLeftOut() {
        TenantPair tenants = fixtures.twoTenants();
        String batchId = batch(tenants.a());
        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", batchId);
        batch(tenants.b());

        assertThat(tasks(tenants.a()).path("total").asInt()).isZero();
        assertThat(tasks(tenants.b()).path("incomplete").valueStream().map(t -> t.path("batchId").asString()))
                .doesNotContain(batchId);
        assertThat(fixtures.get(fixtures.member(tenants.a(), UserRole.SUPPLIER), "/api/v1/tasks")).hasStatus(403);
    }
}
