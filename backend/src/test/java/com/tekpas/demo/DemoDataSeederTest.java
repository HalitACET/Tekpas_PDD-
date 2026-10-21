package com.tekpas.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.auth.ClientType;
import com.tekpas.product.Gtin;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/** application-test.yml sets DEMO_PASSWORD to {@value #DEMO_PASSWORD}. */
@IntegrationTest
@ActiveProfiles({"test", "demo"})
class DemoDataSeederTest {

    static final String DEMO_PASSWORD = "test-demo-password";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    DemoDataSeeder seeder;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void demoOwnerLogsInWithDemoPassword() {
        MvcTestResult result = fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD, ClientType.WEB);

        assertThat(result).hasStatusOk();
        JsonNode user = fixtures.body(result).path("user");
        assertThat(user.path("id").asString()).isEqualTo("10000000-0000-0000-0000-000000000001");
        assertThat(user.path("role").asString()).isEqualTo("OWNER");
        assertThat(user.path("company").path("name").asString()).isEqualTo("Nilüfer Giyim A.Ş.");
    }

    @Test
    void demoSupplierLogsInWithDemoPassword() {
        MvcTestResult result = fixtures.loginRequest("lab@uludagboya.example", DEMO_PASSWORD, ClientType.MOBILE);

        assertThat(result).hasStatusOk();
        assertThat(fixtures.body(result).path("user").path("company").path("type").asString())
                .isEqualTo("DYEHOUSE");
    }

    @Test
    void seedingTwiceChangesNothing() {
        int companiesBefore = countDemoCompanies();
        int usersBefore = countDemoUsers();

        seeder.run(null);

        assertThat(countDemoCompanies()).isEqualTo(companiesBefore).isEqualTo(5);
        assertThat(countDemoUsers()).isEqualTo(usersBefore).isEqualTo(2);
        assertThat(count("product")).isEqualTo(3);
        assertThat(count("batch")).isEqualTo(5);
        assertThat(fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD, ClientType.MOBILE))
                .hasStatusOk();
    }

    @Test
    void olderSpellingsOfDemoNamesAreCorrectedAndASecondStartTouchesNothing() {
        // Live data from before the fix: names without Turkish characters.
        jdbc.update("UPDATE company SET name = 'Nilufer Giyim A.S.' WHERE id = ?", DemoDataSeeder.NILUFER);
        jdbc.update("UPDATE company SET name = 'Uludag Boya Terbiye' WHERE id = '00000000-0000-0000-0000-000000000004'");
        jdbc.update("UPDATE app_user SET full_name = 'Demo Yonetici' WHERE id = '10000000-0000-0000-0000-000000000001'");

        seeder.run(null);

        assertThat(jdbc.queryForList("SELECT name FROM company WHERE id::text LIKE '00000000-0000-0000-0000-00000000000_' "
                + "ORDER BY id", String.class)).containsExactly("Nilüfer Giyim A.Ş.", "Ege İplik San. Ltd.",
                "Demirtaş Örme Kumaş A.Ş.", "Uludağ Boya Terbiye", "İnegöl Fason Dikim");
        assertThat(jdbc.queryForList("SELECT full_name FROM app_user WHERE id::text LIKE "
                + "'10000000-0000-0000-0000-00000000000_' ORDER BY id", String.class))
                .containsExactly("Demo Yönetici", "Boyahane Lab");

        // Postgres gives a row a new xmin on every write: equal versions mean the second start wrote nothing.
        List<String> companiesBefore = rowVersions("company", "00000000-0000-0000-0000-00000000000_");
        List<String> usersBefore = rowVersions("app_user", "10000000-0000-0000-0000-00000000000_");

        seeder.run(null);

        assertThat(rowVersions("company", "00000000-0000-0000-0000-00000000000_")).isEqualTo(companiesBefore);
        assertThat(rowVersions("app_user", "10000000-0000-0000-0000-00000000000_")).isEqualTo(usersBefore);
    }

    private List<String> rowVersions(String table, String idPattern) {
        return jdbc.queryForList("SELECT xmin::text FROM " + table + " WHERE id::text LIKE ? ORDER BY id", String.class,
                idPattern);
    }

    private String ownerToken() {
        return fixtures.body(fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD, ClientType.MOBILE))
                .path("accessToken").asString();
    }

    private JsonNode get(String token, String uri) {
        MvcTestResult result = fixtures.mvc().get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    /** The demo's five moments (docs/m10-plan.md §3), one batch each. */
    @Test
    void demoOwnerSeesThreeProductsAndFiveBatchesAtEveryStage() {
        String token = ownerToken();

        JsonNode products = get(token, "/api/v1/products?sort=name");
        JsonNode batches = get(token, "/api/v1/batches");

        assertThat(products.path("content").valueStream().map(p -> p.path("name").asString()))
                .containsExactly("Keten Gömlek", "Mavi Basic Tişört", "Organik Pamuk Polo");
        assertThat(products.path("content").valueStream().mapToLong(p -> p.path("batchCount").asLong()))
                .containsExactly(1L, 2L, 2L);
        assertThat(batches.path("totalElements").asLong()).isEqualTo(5);
        assertThat(batches.path("content").valueStream().map(b -> b.path("batchNo").asString() + ":"
                + b.path("status").asString())).containsExactlyInAnyOrder("KP-2026-0901-A:PUBLISHED",
                "KP-2026-0922-A:READY", "KP-2026-0915-A:COLLECTING", "KP-2026-0929-A:COLLECTING",
                "KP-2026-0918-A:DRAFT");
    }

    @Test
    void demoOwnerSeesTheSupplierNetworkAndTheDataWaitingForReview() {
        String token = ownerToken();

        JsonNode suppliers = get(token, "/api/v1/suppliers?sort=name");
        JsonNode chain = get(token, "/api/v1/batches/" + DemoDataSeeder.BATCHES.get(2).id() + "/chain");

        // The fifth batch is still being set up: no dyehouse and no sewing workshop assigned.
        assertThat(suppliers.path("content").valueStream().map(s -> s.path("name").asString() + ":"
                + s.path("batchCount").asLong() + ":" + s.path("contactName").asString()))
                .containsExactlyInAnyOrder("Demirtaş Örme Kumaş A.Ş.:5:Selin Arslan", "Ege İplik San. Ltd.:5:Mehmet Kaya",
                        "İnegöl Fason Dikim:4:Hakan Demir", "Uludağ Boya Terbiye:4:Zeynep Arslan");
        assertThat(chain.path("steps").valueStream().map(s -> s.path("stepType").asString() + ":"
                + s.path("status").asString())).containsExactly("FIBER:APPROVED", "YARN:APPROVED", "FABRIC:SUBMITTED",
                "DYEING:PENDING", "SEWING:PENDING");
        JsonNode fabric = chain.path("steps").get(2);
        assertThat(fabric.path("submission").path("name").asString()).isEqualTo("Selin Arslan");
        assertThat(fabric.path("data").path("gsm").asInt()).isEqualTo(210);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM supply_step s JOIN batch b ON b.id = s.batch_id "
                + "WHERE b.company_id = ?", Integer.class, DemoDataSeeder.NILUFER)).isEqualTo(25);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM supply_step_input i JOIN supply_step s ON s.id = i.step_id "
                + "JOIN batch b ON b.id = s.batch_id WHERE b.company_id = ?", Integer.class, DemoDataSeeder.NILUFER))
                .isEqualTo(20);
    }

    @Test
    void theScenarioShowsAPublishedPassportABatchReadyToPublishAReadCertificateAMismatchAndAnExpiry() {
        String token = ownerToken();

        // 1: published, open to anyone at its GS1 Digital Link.
        assertThat(fixtures.mvc().get().uri("/api/v1/public/passports/01/02012345000018/10/KP-2026-0901-A").exchange())
                .hasStatusOk();
        // 2: every blocker cleared.
        JsonNode score = get(token, "/api/v1/batches/" + DemoDataSeeder.BATCHES.get(1).id() + "/score");
        assertThat(score.path("publishable").asBoolean()).isTrue();
        assertThat(score.path("score").asInt()).isGreaterThanOrEqualTo(score.path("threshold").asInt());
        // 3: the knitter's GOTS certificate, read by the AI, waits for a person.
        JsonNode awaiting = get(token, "/api/v1/documents/awaiting-review");
        assertThat(awaiting.valueStream().map(d -> d.path("docType").asString() + ":" + d.path("batchNo").asString()))
                .contains("GOTS:KP-2026-0915-A");
        // 4: the fabric contradicts the label.
        JsonNode issues = get(token, "/api/v1/batches/" + DemoDataSeeder.BATCHES.get(3).id() + "/issues");
        assertThat(issues.path("issues").valueStream().map(i -> i.path("code").asString())).contains("LIF-01");
        // The dyehouse's certificate ends within the warning days.
        JsonNode expiring = get(token, "/api/v1/documents/expiring?days=30");
        assertThat(expiring.valueStream().map(c -> c.path("supplierName").asString() + ":" + c.path("daysLeft").asInt()))
                .contains("Uludağ Boya Terbiye:20");
        assertThat(jdbc.queryForList("SELECT version FROM demo_scenario", Integer.class)).contains(DemoScenario.VERSION);
    }

    @Test
    void theScenarioIsAppliedOnceAndLaterChangesStay() {
        UUID fabric = UUID.fromString("40000000-0000-0000-0000-000000000033");
        jdbc.update("UPDATE supply_step SET data = jsonb_set(data, '{gsm}', '220') WHERE id = ?", fabric);

        seeder.run(null);

        assertThat(jdbc.queryForObject("SELECT (data->>'gsm')::int FROM supply_step WHERE id = ?", Integer.class, fabric))
                .isEqualTo(220);
        jdbc.update("UPDATE supply_step SET data = jsonb_set(data, '{gsm}', '210') WHERE id = ?", fabric);
    }

    @Test
    void demoGtinsHaveValidCheckDigitsInTheRestrictedRange() {
        assertThat(DemoDataSeeder.PRODUCTS).allSatisfy(p -> {
            assertThat(Gtin.hasValidCheckDigit(p.gtin())).as(p.gtin()).isTrue();
            // GS1 restricted circulation (020–029 as GTIN-14): never assigned to a brand.
            assertThat(p.gtin()).hasSize(14).matches("02[0-9]{12}");
        });
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE company_id = ?", Integer.class,
                DemoDataSeeder.NILUFER);
    }

    private int countDemoCompanies() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM company WHERE id::text LIKE '00000000-0000-0000-0000-00000000000_'",
                Integer.class);
    }

    private int countDemoUsers() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM app_user WHERE id::text LIKE '10000000-0000-0000-0000-00000000000_'",
                Integer.class);
    }
}
