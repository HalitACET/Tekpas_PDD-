package com.tekpas.supplychain;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * The fibre origin is the manufacturer's own declaration (PLAN M4): approved on saving, editable by OWNER, ADMIN
 * and EDITOR until the batch is published, and marked as such in the step history.
 */
@IntegrationTest
class FiberOriginTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    static final Map<String, Object> ORIGIN = Map.of("data", Map.of("fiberType", "ORGANIC_COTTON",
            "originCountry", "TR", "originRegion", "Harran, Şanlıurfa", "harvestYear", 2025));

    record Setup(Tenant owner, String batchId, String fiber) {
    }

    Setup setup() {
        Tenant owner = fixtures.tenant();
        String productId = fixtures.body(fixtures.post(owner, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Tişört", "category", "T_SHIRT"))).path("id").asString();
        String batchId = fixtures.body(fixtures.post(owner, "/api/v1/batches",
                Map.of("productId", productId, "quantity", 10))).path("id").asString();
        String fiber = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batchId + "/chain")).path("steps")
                .valueStream().filter(s -> s.path("stepType").asString().equals("FIBER")).findFirst().orElseThrow()
                .path("id").asString();
        return new Setup(owner, batchId, fiber);
    }

    static JsonNode fiberOf(JsonNode chain) {
        return chain.path("steps").valueStream().filter(s -> s.path("stepType").asString().equals("FIBER"))
                .findFirst().orElseThrow();
    }

    @Test
    void anEditorEntersTheOriginAndTheStepIsApprovedAsTheManufacturersDeclaration() {
        Setup s = setup();
        Tenant editor = fixtures.member(s.owner(), UserRole.EDITOR);

        MvcTestResult result = fixtures.patch(editor, "/api/v1/steps/" + s.fiber(), ORIGIN);

        assertThat(result).hasStatusOk();
        JsonNode fiber = fiberOf(fixtures.body(result));
        assertThat(fiber.path("status").asString()).isEqualTo("APPROVED");
        assertThat(fiber.path("data").path("originRegion").asString()).isEqualTo("Harran, Şanlıurfa");
        assertThat(fiber.path("approvedAt").isNull()).isFalse();
        assertThat(jdbc.queryForObject("SELECT approved_by::text FROM supply_step WHERE id = ?::uuid", String.class,
                s.fiber())).isEqualTo(editor.user().getId().toString());
        assertThat(jdbc.queryForObject("SELECT actor_user_id::text FROM step_event WHERE step_id = ?::uuid AND kind = "
                + "'MANUFACTURER_ENTERED'", String.class, s.fiber())).isEqualTo(editor.user().getId().toString());
    }

    @Test
    void theFibreAndItsCountryAreRequired() {
        Setup s = setup();

        MvcTestResult result = fixtures.patch(s.owner(), "/api/v1/steps/" + s.fiber(),
                Map.of("data", Map.of("fiberType", "COTTON")));

        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream().map(e -> e.path("field").asString() + ":"
                + e.path("code").asString())).containsExactly("data.originCountry:NotNull");
    }

    @Test
    void theOriginStaysEditableUntilTheBatchIsPublished() {
        Setup s = setup();
        assertThat(fixtures.patch(s.owner(), "/api/v1/steps/" + s.fiber(), ORIGIN)).hasStatusOk();

        MvcTestResult changed = fixtures.patch(s.owner(), "/api/v1/steps/" + s.fiber(),
                Map.of("data", Map.of("fiberType", "COTTON", "originCountry", "TR")));
        assertThat(changed).hasStatusOk();
        assertThat(fiberOf(fixtures.body(changed)).path("data").path("fiberType").asString()).isEqualTo("COTTON");

        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", s.batchId());
        MvcTestResult locked = fixtures.patch(s.owner(), "/api/v1/steps/" + s.fiber(), ORIGIN);
        assertThat(locked).hasStatus(409);
        assertThat(fixtures.body(locked).path("reason").asString()).isEqualTo("BATCH_PUBLISHED");
    }

    @Test
    void viewersCannotEnterIt() {
        Setup s = setup();

        assertThat(fixtures.patch(fixtures.member(s.owner(), UserRole.VIEWER), "/api/v1/steps/" + s.fiber(), ORIGIN))
                .hasStatus(403);
    }

    @Test
    void otherApprovedStepsStayFixed() {
        Setup s = setup();
        String yarn = fixtures.body(fixtures.get(s.owner(), "/api/v1/batches/" + s.batchId() + "/chain")).path("steps")
                .valueStream().filter(st -> st.path("stepType").asString().equals("YARN")).findFirst().orElseThrow()
                .path("id").asString();
        jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE id = ?::uuid", yarn);

        MvcTestResult result = fixtures.patch(s.owner(), "/api/v1/steps/" + yarn,
                Map.of("data", Map.of("yarnCount", "Ne 20/1")));

        assertThat(result).hasStatus(409);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("STEP_APPROVED");
    }

    @Test
    void theOriginCanBeTheLastApprovalThatMakesTheBatchReady() {
        Setup s = setup();
        jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE batch_id = ?::uuid AND id <> ?::uuid",
                s.batchId(), s.fiber());

        fixtures.patch(s.owner(), "/api/v1/steps/" + s.fiber(), ORIGIN);

        assertThat(jdbc.queryForObject("SELECT status FROM batch WHERE id = ?::uuid", String.class, s.batchId()))
                .isEqualTo("READY");
    }
}
