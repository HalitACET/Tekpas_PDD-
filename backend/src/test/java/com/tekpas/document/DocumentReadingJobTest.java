package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The reading job end to end (PLAN M5 T4): upload, the worker reads the synthetic certificate, the panel sees the
 * proposal, nothing is applied and the supplier sees none of it.
 */
@IntegrationTest
class DocumentReadingJobTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @Autowired
    ObjectMapper json;

    @Autowired
    JobQueue queue;

    @Autowired
    JobWorker worker;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
        clock.reset();
    }

    private static byte[] fixture(String name) throws IOException {
        try (InputStream in = DocumentReadingJobTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).isNotNull();
            return in.readAllBytes();
        }
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of earlier tests (their files are gone: they end FAILED)
        }
    }

    private String upload(Tenant owner, String stepId, String name, String type) throws IOException {
        return fixtures.body(t.upload(owner, stepId, fixture(name), name, type)).path("id").asString();
    }

    private JsonNode document(Tenant owner, String id) {
        return fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id));
    }

    private String jobStatus(String documentId) {
        return jdbc.queryForObject("SELECT status FROM job WHERE type = 'AI_EXTRACT_DOCUMENT' "
                + "AND payload->>'documentId' = ? ORDER BY id DESC LIMIT 1", String.class, documentId);
    }

    @Test
    void aCertificateIsReadIntoAProposalAndNothingIsApplied() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf", "application/pdf");

        drain();

        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("READ");
        assertThat(doc.path("extractionMethod").asString()).isEqualTo("TEXT_RULES");
        assertThat(doc.path("extractedAt").isNull()).isFalse();
        JsonNode extraction = doc.path("extraction");
        assertThat(extraction.path("detectedType").asString()).isEqualTo("OEKO_TEX");
        assertThat(extraction.path("fields").path("certNo").path("value").asString()).isEqualTo("DEMO-OT-2026-0417");
        assertThat(extraction.path("fields").path("certNo").path("confidence").asDouble()).isEqualTo(0.95);
        assertThat(extraction.path("fields").path("validUntil").path("value").asString()).isEqualTo("2027-03-31");
        assertThat(extraction.path("fields").path("holderName").path("evidence").path("page").asInt()).isEqualTo(1);
        // AI proposes, a person approves: the document's own type and the real fields stay untouched.
        assertThat(doc.path("docType").asString()).isEqualTo("UNKNOWN");
        assertThat(doc.path("reviewStatus").asString()).isEqualTo("UNREVIEWED");
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT cert_no, holder_name, valid_until, extraction_model FROM document WHERE id = ?::uuid", id);
        assertThat(row.values()).containsOnlyNulls();
        assertThat(jobStatus(id)).isEqualTo("DONE");
    }

    @Test
    void aScanAndAPhotoHaveNoTextLayer() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String scan = upload(owner, s.yarnStep(), "scanned-oekotex.pdf", "application/pdf");
        String photo = upload(owner, s.yarnStep(), "photo-certificate.jpg", "image/jpeg");

        drain();

        for (String id : new String[] {scan, photo}) {
            JsonNode doc = document(owner, id);
            assertThat(doc.path("extractionStatus").asString()).isEqualTo("UNREADABLE");
            assertThat(doc.path("failureCode").asString()).isEqualTo("NO_TEXT_LAYER");
            assertThat(doc.path("extractionMethod").asString()).isEqualTo("NONE");
            assertThat(doc.path("extraction").isNull()).isTrue();
        }
    }

    @Test
    void theSupplierNeverSeesTheReading() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        assertThat(t.publicUpload(token, fixture("oekotex-standard100.pdf"), "sertifika.pdf", "application/pdf"))
                .hasStatus(201);

        drain();

        String view = fixtures.responseText(t.publicOpen(token));
        assertThat(view).doesNotContain("DEMO-OT-2026-0417", "Ornek Iplik", "OEKO_TEX", "READ", "confidence",
                "extraction");
    }

    @Test
    void aDocumentRemovedBeforeItsTurnIsSkipped() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf", "application/pdf");
        assertThat(fixtures.delete(owner, "/api/v1/documents/" + id)).hasStatus(204);

        drain();

        assertThat(jobStatus(id)).isEqualTo("DONE");
    }

    @Test
    void aFileMissingFromTheStorageEndsTheReadingAtOnce() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf", "application/pdf");
        storage.reset();

        drain();

        assertThat(jobStatus(id)).isEqualTo("FAILED");
        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("FAILED");
        assertThat(doc.path("failureCode").asString()).isEqualTo("EXTRACT_FAILED");
    }

    @Test
    void aStorageOutageIsRetriedAndTheSecondAttemptReads() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "gots-scope-certificate.pdf", "application/pdf");
        storage.failing(true);

        drain();

        assertThat(jobStatus(id)).isEqualTo("QUEUED");
        assertThat(document(owner, id).path("extractionStatus").asString()).isEqualTo("RUNNING");

        storage.failing(false);
        clock.advance(Duration.ofSeconds(31));
        drain();

        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("READ");
        assertThat(doc.path("extraction").path("detectedType").asString()).isEqualTo("GOTS");
    }

    @Test
    void readingAgainChangesNothing() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-partial.pdf", "application/pdf");
        drain();
        JsonNode first = document(owner, id);
        assertThat(first.path("extractionStatus").asString()).isEqualTo("PARTIAL");

        clock.advance(Duration.ofMinutes(5));
        queue.enqueue(JobType.AI_EXTRACT_DOCUMENT, new ExtractDocument(java.util.UUID.fromString(id)));
        drain();

        assertThat(document(owner, id).path("extractedAt").asString()).isEqualTo(first.path("extractedAt").asString());
    }
}
