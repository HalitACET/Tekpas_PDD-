package com.tekpas.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.auth.ClientType;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
        assertThat(user.path("company").path("name").asString()).isEqualTo("Nilufer Giyim A.S.");
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
        assertThat(fixtures.loginRequest("admin@nilufergiyim.example", DEMO_PASSWORD, ClientType.MOBILE))
                .hasStatusOk();
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
