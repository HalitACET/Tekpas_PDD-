package com.tekpas.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

/**
 * What queues a check (M7 T3, docs/m7-plan.md §5): changes of the data the rules read, queued once per batch, and the
 * daily scan of ending certificates. The jobs run through the worker, as they would in production.
 */
@IntegrationTest
class ValidationTriggersTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    com.tekpas.jobs.JobQueue queue;

    record Setup(Tenant owner, String productId, String batchId, String yarnStepId) {
    }

    @BeforeEach
    void init() {
        storage.reset();
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    private Setup batch(Tenant owner, boolean withLabel) {
        Map<String, Object> product = new HashMap<>();
        product.put("gtin", TestGtins.gtin13());
        product.put("name", "Organik Pamuk Polo");
        product.put("category", "T_SHIRT");
        if (withLabel) {
            product.put("declaredFiberComposition", List.of(Map.of("fiber", "ORGANIC_COTTON", "percent", 100)));
        }
        String productId = fixtures.body(fixtures.post(owner, "/api/v1/products", product)).path("id").asString();
        String batchId = fixtures.body(fixtures.post(owner, "/api/v1/batches", Map.of("productId", productId,
                "quantity", 10, "producedFrom", "2026-09-01", "producedTo", "2026-09-10"))).path("id").asString();
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batchId + "/chain"));
        String yarn = null;
        for (JsonNode step : chain.path("steps")) {
            if ("YARN".equals(step.path("stepType").asString())) {
                yarn = step.path("id").asString();
            }
        }
        return new Setup(owner, productId, batchId, yarn);
    }

    private JsonNode issues(Setup s, String status) {
        return fixtures.body(fixtures.get(s.owner(), "/api/v1/batches/" + s.batchId() + "/issues?status=" + status));
    }

    private static boolean has(JsonNode list, String code) {
        return list.path("issues").valueStream().anyMatch(i -> code.equals(i.path("code").asString()));
    }

    private long queued(Setup s) {
        Long n = jdbc.queryForObject("""
                SELECT count(*) FROM job
                WHERE type = 'RULE_VALIDATE_BATCH' AND status = 'QUEUED' AND payload->>'batchId' = ?
                """, Long.class, s.batchId());
        return n == null ? 0 : n;
    }

    /** A confirmed certificate of the yarn step, written straight to the table (no trigger fires). */
    private String certificate(Setup s, String docType, int daysFromToday, String holder) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO document (id, company_id, step_id, doc_type, file_key, original_name, mime_type, size_bytes,
                    sha256, cert_no, holder_name, valid_from, valid_until, extraction_status, review_status)
                VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, 'application/pdf', 1000, ?, 'C-1', ?,
                    CURRENT_DATE - 400, CURRENT_DATE + ?, 'READ', 'VERIFIED')
                """, id, s.owner().company().getId().toString(), s.yarnStepId(), docType, "k/" + id, docType + ".pdf",
                id.replace("-", "") + id.replace("-", "").substring(0, 32), holder, daysFromToday);
        return id;
    }

    @Test
    void aChangedLabelQueuesOneCheckPerBatchAndTheCheckClosesWhatItFixed() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false);
        drain();
        assertThat(fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/validate", Map.of())).hasStatusOk();
        assertThat(has(issues(s, "OPEN"), "EKS-01")).isTrue();

        for (int i = 0; i < 2; i++) {
            assertThat(fixtures.patch(owner, "/api/v1/products/" + s.productId(), Map.of("declaredFiberComposition",
                    List.of(Map.of("fiber", "ORGANIC_COTTON", "percent", 100))))).hasStatusOk();
        }

        // Two changes while the check waits: one job, which will see the newest data.
        assertThat(queued(s)).isEqualTo(1);
        drain();
        assertThat(has(issues(s, "OPEN"), "EKS-01")).isFalse();
        JsonNode closed = issues(s, "RESOLVED").path("issues").valueStream()
                .filter(i -> "EKS-01".equals(i.path("code").asString())).findFirst().orElseThrow();
        assertThat(closed.path("autoResolved").asBoolean()).isTrue();
    }

    @Test
    void changingTheProductionDatesQueuesACheck() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true);
        drain();
        assertThat(queued(s)).isZero();

        assertThat(fixtures.patch(owner, "/api/v1/batches/" + s.batchId(), Map.of("quantity", 20))).hasStatusOk();
        assertThat(queued(s)).isZero();

        assertThat(fixtures.patch(owner, "/api/v1/batches/" + s.batchId(), Map.of("producedTo", "2026-09-12")))
                .hasStatusOk();
        assertThat(queued(s)).isEqualTo(1);
    }

    @Test
    void aStepChangeAndADocumentUploadQueueAChecksAndBel01Appears() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true);
        drain();

        try (InputStream in = ValidationTriggersTest.class.getResourceAsStream("/documents/gots-scope-certificate.pdf")) {
            assertThat(in).isNotNull();
            assertThat(fixtures.mvc().post().uri("/api/v1/steps/" + s.yarnStepId() + "/documents").multipart()
                    .file(new MockMultipartFile("file", "gots.pdf", "application/pdf", in.readAllBytes()))
                    .header(HttpHeaders.AUTHORIZATION, owner.bearer()).exchange()).hasStatus(202);
        }
        assertThat(queued(s)).isEqualTo(1);
        drain();

        JsonNode open = issues(s, "OPEN");
        assertThat(has(open, "BEL-01")).isTrue();
        assertThat(open.path("validatedAt").asString()).isNotBlank();
    }

    @Test
    void theDailyScanChecksOnlyBatchesWithACertificateEndingWithinThirtyDays() {
        Tenant owner = fixtures.tenant();
        Setup ending = batch(owner, true);
        Setup far = batch(owner, true);
        Setup none = batch(owner, true);
        drain();
        certificate(ending, "GOTS", 10, "Ege İplik");
        certificate(far, "GOTS", 100, "Ege İplik");

        queue.enqueue(com.tekpas.jobs.JobType.CERT_EXPIRY_SCAN, Map.of());
        drain();

        assertThat(has(issues(ending, "OPEN"), "SER-02")).isTrue();
        assertThat(issues(far, "ALL").path("validatedAt").isNull()).isTrue();
        assertThat(issues(none, "ALL").path("validatedAt").isNull()).isTrue();
    }

    @Test
    void theDailyScanAlsoCatchesCertificatesThatAlreadyEnded() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true);
        drain();
        certificate(s, "OEKO_TEX", -3, "Ege İplik");

        queue.enqueue(com.tekpas.jobs.JobType.CERT_EXPIRY_SCAN, Map.of());
        drain();

        JsonNode open = issues(s, "OPEN");
        assertThat(has(open, "SER-01")).isTrue();
        assertThat(open.path("open").path("errors").asInt()).isEqualTo(1);
    }

    @Test
    void theExpiringListHasTheClosestEndFirstAndLeavesRenewedCertificatesOut() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true);
        String soon = certificate(s, "GOTS", 10, "Ege İplik");
        String ended = certificate(s, "OEKO_TEX", -2, "Ege İplik");
        String renewedOld = certificate(s, "GRS", 5, "Ege İplik");
        certificate(s, "GRS", 300, "Ege İplik");
        Setup other = batch(owner, true);
        certificate(other, "GOTS", 20, "Başka");

        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/documents/expiring"));

        assertThat(list.valueStream().map(c -> c.path("documentId").asString()).toList()).startsWith(ended, soon)
                .doesNotContain(renewedOld).hasSize(3);
        JsonNode first = list.get(0);
        assertThat(first.path("docType").asString()).isEqualTo("OEKO_TEX");
        assertThat(first.path("daysLeft").asInt()).isEqualTo(-2);
        assertThat(first.path("stepType").asString()).isEqualTo("YARN");
        assertThat(first.path("stepId").asString()).isEqualTo(s.yarnStepId());
        assertThat(first.path("batchId").asString()).isEqualTo(s.batchId());
        assertThat(first.path("batchNo").asString()).isNotBlank();
        assertThat(first.path("holderName").asString()).isEqualTo("Ege İplik");
        assertThat(list.get(1).path("daysLeft").asInt()).isEqualTo(10);

        // A longer window brings the renewal (300 days) in.
        JsonNode wide = fixtures.body(fixtures.get(owner, "/api/v1/documents/expiring?days=365"));
        assertThat(wide.size()).isEqualTo(4);
    }

    @Test
    void theExpiringListIsTheCompanysOwnAndForStaffOnly() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true);
        certificate(s, "GOTS", 10, "Ege İplik");
        Tenant other = fixtures.tenant();

        assertThat(fixtures.body(fixtures.get(other, "/api/v1/documents/expiring"))).isEmpty();
        assertThat(fixtures.get(fixtures.member(owner, UserRole.VIEWER), "/api/v1/documents/expiring")).hasStatusOk();
        assertThat(fixtures.get(fixtures.member(owner, UserRole.SUPPLIER), "/api/v1/documents/expiring")).hasStatus(403);
        assertThat(fixtures.mvc().get().uri("/api/v1/documents/expiring").exchange()).hasStatus(401);
        assertThat(fixtures.get(owner, "/api/v1/documents/expiring?days=0")).hasStatus(400);
        assertThat(fixtures.get(owner, "/api/v1/documents/expiring?days=366")).hasStatus(400);
        assertThat(fixtures.get(owner, "/api/v1/documents/expiring?days=abc")).hasStatus(400);
    }
}
