package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * GET /batches/{id}/score and the score on the batch list (M6 T1, docs/m6-plan.md §2). The rules themselves are in
 * {@code ComplianceScoreTest}; here: what the API returns for a real batch, which documents count, and who may ask.
 */
@IntegrationTest
class BatchScoreApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    ObjectMapper json;

    @Autowired
    JobWorker worker;

    @Autowired
    JdbcTemplate jdbc;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private JsonNode score(Tenant tenant, String batchId) {
        return fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId + "/score"));
    }

    private JsonNode criterion(JsonNode score, String code) {
        return score.path("criteria").valueStream().filter(c -> c.path("code").asString().equals(code)).findFirst()
                .orElseThrow();
    }

    private String upload(Tenant owner, String stepId, String name) throws IOException {
        try (InputStream in = BatchScoreApiTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).isNotNull();
            return fixtures.body(t.upload(owner, stepId, in.readAllBytes(), name, "application/pdf")).path("id")
                    .asString();
        }
    }

    private void confirm(Tenant owner, String id, String type, String until) {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
        Map<String, Object> body = new HashMap<>();
        body.put("docType", type);
        body.put("certNo", "DEMO-" + type);
        body.put("validFrom", "2019-01-01");
        body.put("validUntil", until);
        assertThat(fixtures.post(owner, "/api/v1/documents/" + id + "/verify", body)).hasStatusOk();
    }

    @Test
    void aFreshBatchScoresWhatItsProductGivesAndEverythingBlocks() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        JsonNode r = score(owner, s.batchId());

        // The product has a category (5); no steps approved, no fields filled, no dates, no certificates.
        assertThat(r.path("score").asInt()).isEqualTo(5);
        assertThat(r.path("threshold").asInt()).isEqualTo(90);
        assertThat(r.path("publishable").asBoolean()).isFalse();
        assertThat(r.path("blockers").valueStream().map(b -> b.path("code").asString()).distinct())
                .containsExactly("STEP_NOT_APPROVED", "SCORE_BELOW_THRESHOLD");
        assertThat(r.path("blockers").valueStream().filter(b -> b.path("code").asString().equals("STEP_NOT_APPROVED"))
                .count()).isEqualTo(5);
        assertThat(criterion(r, "STEPS_APPROVED").path("items")).hasSize(5);
        assertThat(criterion(r, "VALID_CERTIFICATES").path("items")).hasSize(3);
    }

    @Test
    void approvedStepsAndConfirmedCertificatesRaiseItAndOnlyConfirmedOnesCount() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE batch_id = ?::uuid", s.batchId());
        String doc = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");

        JsonNode before = score(owner, s.batchId());
        assertThat(criterion(before, "STEPS_APPROVED").path("earned").asInt()).isEqualTo(50);
        assertThat(criterion(before, "VALID_CERTIFICATES").path("earned").asInt()).isZero();
        assertThat(before.path("warnings").get(0).path("code").asString()).isEqualTo("UNREVIEWED_DOCUMENTS");
        assertThat(before.path("warnings").get(0).path("count").asInt()).isEqualTo(1);

        confirm(owner, doc, "OEKO_TEX", "2099-01-01");

        JsonNode after = score(owner, s.batchId());
        // One of the three certificate steps (yarn, fabric, dyeing): 20 * 1/3 → 6.
        assertThat(criterion(after, "VALID_CERTIFICATES").path("earned").asInt()).isEqualTo(6);
        assertThat(after.path("score").asInt()).isEqualTo(before.path("score").asInt() + 6);
        // Nothing waits for confirmation any more (the consistency warnings of M7 are a separate line).
        assertThat(after.path("warnings").valueStream().map(w -> w.path("code").asString()))
                .doesNotContain("UNREVIEWED_DOCUMENTS", "CERTIFICATE_EXPIRING");
    }

    @Test
    void anExpiredConfirmedCertificateBlocks() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        confirm(owner, upload(owner, s.yarnStep(), "gots-scope-certificate.pdf"), "GOTS", "2020-06-30");

        JsonNode r = score(owner, s.batchId());

        assertThat(r.path("blockers").valueStream()).anySatisfy(b -> {
            assertThat(b.path("code").asString()).isEqualTo("CERTIFICATE_EXPIRED");
            assertThat(b.path("stepId").asString()).isEqualTo(s.yarnStep());
            assertThat(b.path("stepType").asString()).isEqualTo("YARN");
            assertThat(b.path("docType").asString()).isEqualTo("GOTS");
            assertThat(b.path("validUntil").asString()).isEqualTo("2020-06-30");
        });
    }

    @Test
    void theBatchListCarriesTheScoreToo() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/batches?size=100"));
        JsonNode mine = list.path("content").valueStream().filter(b -> b.path("id").asString().equals(s.batchId()))
                .findFirst().orElseThrow();
        JsonNode detail = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId()));

        assertThat(mine.path("score").asInt()).isEqualTo(5).isEqualTo(detail.path("score").asInt());
    }

    @Test
    void anotherCompanysBatchIsNotFound() {
        TenantPair tenants = fixtures.twoTenants();
        Setup theirs = t.setup(tenants.b());

        assertThat(fixtures.get(tenants.a(), "/api/v1/batches/" + theirs.batchId() + "/score")).hasStatus(404);
        assertThat(fixtures.get(tenants.a(), "/api/v1/batches/" + UUID.randomUUID() + "/score")).hasStatus(404);
    }

    @Test
    void aViewerMayReadItAndASupplierMayNot() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
        Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);

        assertThat(fixtures.get(viewer, "/api/v1/batches/" + s.batchId() + "/score")).hasStatusOk();
        assertThat(fixtures.get(supplier, "/api/v1/batches/" + s.batchId() + "/score")).hasStatus(403);
    }

    @Test
    void withoutLoginItIsUnauthorized() {
        assertThat(fixtures.mvc().get().uri("/api/v1/batches/" + UUID.randomUUID() + "/score").exchange())
                .hasStatus(401);
    }
}
