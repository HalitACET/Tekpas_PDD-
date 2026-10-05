package com.tekpas.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.auth.ClientType;
import com.tekpas.product.Gtin;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import java.util.List;
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

    @Test
    void demoOwnerSeesThreeProductsAndFiveDraftBatches() {
        String token = fixtures.body(fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD,
                ClientType.MOBILE)).path("accessToken").asString();

        JsonNode products = fixtures.body(fixtures.mvc().get().uri("/api/v1/products?sort=name")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange());
        JsonNode batches = fixtures.body(fixtures.mvc().get().uri("/api/v1/batches")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange());

        assertThat(products.path("content").valueStream().map(p -> p.path("name").asString()))
                .containsExactly("Keten Gömlek", "Mavi Basic Tişört", "Organik Pamuk Polo");
        assertThat(products.path("content").valueStream().mapToLong(p -> p.path("batchCount").asLong()))
                .containsExactly(1L, 2L, 2L);
        assertThat(batches.path("totalElements").asLong()).isEqualTo(5);
        assertThat(batches.path("content").valueStream().map(b -> b.path("status").asString()))
                .containsOnly("DRAFT");
    }

    @Test
    void demoOwnerSeesTheSupplierNetworkAndTheShowcaseChain() {
        String token = fixtures.body(fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD,
                ClientType.MOBILE)).path("accessToken").asString();
        seeder.run(null);

        JsonNode suppliers = fixtures.body(fixtures.mvc().get().uri("/api/v1/suppliers?sort=name")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange());
        JsonNode chain = fixtures.body(fixtures.mvc().get()
                .uri("/api/v1/batches/" + DemoDataSeeder.BATCHES.get(0).id() + "/chain")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange());

        assertThat(suppliers.path("content").valueStream().map(s -> s.path("name").asString()))
                .containsExactlyInAnyOrder("Demirtaş Örme Kumaş A.Ş.", "Ege İplik San. Ltd.", "İnegöl Fason Dikim",
                        "Uludağ Boya Terbiye");
        assertThat(suppliers.path("content").valueStream().mapToLong(s -> s.path("batchCount").asLong()))
                .containsOnly(5L);
        assertThat(chain.path("steps").valueStream().map(s -> s.path("stepType") + ":" + s.path("status")))
                .containsExactly("\"FIBER\":\"APPROVED\"", "\"YARN\":\"APPROVED\"", "\"FABRIC\":\"SUBMITTED\"",
                        "\"DYEING\":\"PENDING\"", "\"SEWING\":\"PENDING\"");
        assertThat(chain.path("steps").get(1).path("data").path("energyKwhPerKg").decimalValue())
                .isEqualByComparingTo("2.9");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM supply_step s JOIN batch b ON b.id = s.batch_id "
                + "WHERE b.company_id = ?", Integer.class, DemoDataSeeder.NILUFER)).isEqualTo(25);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM supply_step_input i JOIN supply_step s ON s.id = i.step_id "
                + "JOIN batch b ON b.id = s.batch_id WHERE b.company_id = ?", Integer.class, DemoDataSeeder.NILUFER))
                .isEqualTo(20);
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
