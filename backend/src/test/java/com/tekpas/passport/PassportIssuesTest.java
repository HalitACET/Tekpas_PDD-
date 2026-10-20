package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.jobs.JobWorker;
import com.tekpas.passport.PassportTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * Consistency issues and publishing (M7 T2, docs/m7-plan.md §4). The acceptance scenario: the label says 95 % organic
 * cotton + 5 % elastane, the fabric says 80 % + 20 % polyester; the red issue shows before the passport can go out.
 */
@IntegrationTest
class PassportIssuesTest {

    private static final String LABEL_95_5 =
            "[{\"fiber\":\"ORGANIC_COTTON\",\"percent\":95},{\"fiber\":\"ELASTANE\",\"percent\":5}]";
    private static final String FABRIC_80_20 = """
            {"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":80},{"fiber":"POLYESTER","percent":20}],
             "fabricType":"Süprem","gsm":180.00,"deliveredKg":800}""";
    private static final String FABRIC_95_5 = """
            {"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":95},{"fiber":"ELASTANE","percent":5}],
             "fabricType":"Süprem","gsm":180.00,"deliveredKg":800}""";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    PassportTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new PassportTestSupport(fixtures, jdbc, worker);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private void fabric(Setup s, String data) {
        jdbc.update("UPDATE supply_step SET data = ?::jsonb WHERE id = ?::uuid", data, s.steps().get("FABRIC"));
    }

    private void label(Setup s, String composition) {
        jdbc.update("UPDATE product SET declared_fiber_composition = ?::jsonb WHERE id = ?::uuid", composition,
                s.productId());
    }

    private MvcTestResult publish(Tenant owner, Setup s) {
        return fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports", Map.of());
    }

    private JsonNode issues(Tenant owner, Setup s, String status) {
        return fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/issues?status=" + status));
    }

    @Test
    void aLabelThatDisagreesWithTheFabricStopsPublishingAndCorrectingItLetsItThrough() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        label(s, LABEL_95_5);
        fabric(s, FABRIC_80_20);

        MvcTestResult refused = publish(owner, s);

        assertThat(refused).hasStatus(409);
        JsonNode body = fixtures.body(refused);
        assertThat(body.path("reason").asString()).isEqualTo("PUBLISH_BLOCKED");
        JsonNode open = body.path("blockers").valueStream().filter(b -> "ISSUES_OPEN".equals(b.path("code").asString()))
                .findFirst().orElseThrow();
        assertThat(open.path("count").asInt()).isEqualTo(1);
        // The refusal kept what the check found: the Uyarılar tab shows the same issue.
        JsonNode open1 = issues(owner, s, "OPEN");
        assertThat(open1.path("open").path("errors").asInt()).isEqualTo(1);
        assertThat(open1.path("issues").valueStream().map(i -> i.path("code").asString())).contains("LIF-01");
        // And the score card says the same, without running anything.
        JsonNode score = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/score"));
        assertThat(score.path("publishable").asBoolean()).isFalse();
        assertThat(score.path("blockers").valueStream().map(b -> b.path("code").asString())).contains("ISSUES_OPEN");
        // The batch carries the badge counts.
        JsonNode batch = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId()));
        assertThat(batch.path("openIssues").path("errors").asInt()).isEqualTo(1);

        fabric(s, FABRIC_95_5);
        MvcTestResult published = publish(owner, s);

        assertThat(published).hasStatus(201);
        assertThat(issues(owner, s, "OPEN").path("open").path("errors").asInt()).isZero();
        JsonNode lif = issues(owner, s, "RESOLVED").path("issues").valueStream()
                .filter(i -> "LIF-01".equals(i.path("code").asString())).findFirst().orElseThrow();
        assertThat(lif.path("autoResolved").asBoolean()).isTrue();
    }

    @Test
    void aStaleIssueDoesNotMatterBecausePublishingChecksAgain() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        label(s, LABEL_95_5);
        fabric(s, FABRIC_80_20);
        assertThat(fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/validate", Map.of())).hasStatusOk();
        // The data is corrected behind the stored issue's back (no job has run): the publishing still goes out.
        fabric(s, FABRIC_95_5);

        assertThat(publish(owner, s)).hasStatus(201);
    }

    @Test
    void openWarningsAreShownByTheScoreButDoNotStopPublishing() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        // The fixture's certificate holder is not the (suffixed) supplier name: SER-03 warnings.
        assertThat(fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/validate", Map.of())).hasStatusOk();

        JsonNode score = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/score"));

        assertThat(score.path("publishable").asBoolean()).isTrue();
        JsonNode warning = score.path("warnings").valueStream()
                .filter(w -> "ISSUE_WARNINGS".equals(w.path("code").asString())).findFirst().orElseThrow();
        assertThat(warning.path("count").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(publish(owner, s)).hasStatus(201);
    }
}
