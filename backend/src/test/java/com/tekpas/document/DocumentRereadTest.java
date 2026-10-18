package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.ObjectMapper;

/**
 * "Tekrar oku" (M5 T7, design v0.5 57e): a reading that FAILED goes back in the queue and is read as if just
 * uploaded. Nothing else can be read again, and the usual rules apply (company, role, published batch).
 */
@IntegrationTest
class DocumentRereadTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper json;

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
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    private String upload(Tenant owner, String stepId) throws IOException {
        try (InputStream in = DocumentRereadTest.class.getResourceAsStream("/documents/oekotex-standard100.pdf")) {
            assertThat(in).isNotNull();
            return fixtures.body(t.upload(owner, stepId, in.readAllBytes(), "oekotex-standard100.pdf",
                    "application/pdf")).path("id").asString();
        }
    }

    private void fail(String id) {
        jdbc.update("UPDATE document SET extraction_status = 'FAILED', extraction_method = 'NONE', "
                + "failure_code = 'EXTRACT_TIMEOUT', extracted_at = now() WHERE id = ?::uuid", id);
    }

    private MvcTestResult reread(Tenant who, String id) {
        return fixtures.post(who, "/api/v1/documents/" + id + "/reread", Map.of());
    }

    private String status(String id) {
        return jdbc.queryForObject("SELECT extraction_status FROM document WHERE id = ?::uuid", String.class, id);
    }

    @Test
    void aFailedReadingIsQueuedAgainAndReadLikeANewUpload() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());
        drain();
        fail(id);
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id)).path("rereadable").asBoolean())
                .isTrue();

        MvcTestResult result = reread(owner, id);

        assertThat(result).hasStatus(202);
        assertThat(fixtures.body(result).path("extractionStatus").asString()).isEqualTo("QUEUED");
        assertThat(fixtures.body(result).path("failureCode").isNull()).isTrue();
        assertThat(fixtures.body(result).path("rereadable").asBoolean()).isFalse();
        assertThat(status(id)).isEqualTo("QUEUED");
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id)).path("rereadable").asBoolean())
                .isFalse(); // queued: nothing to redo yet

        drain();
        assertThat(status(id)).isEqualTo("READ");
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id)).path("extraction").isNull())
                .isFalse();
    }

    @Test
    void onlyAFailedReadingCanBeReadAgain() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());

        t.assertReason(reread(owner, id), 409, "DOCUMENT_NOT_REREADABLE"); // still queued

        drain();
        t.assertReason(reread(owner, id), 409, "DOCUMENT_NOT_REREADABLE"); // read

        jdbc.update("UPDATE document SET extraction_status = 'UNREADABLE' WHERE id = ?::uuid", id);
        t.assertReason(reread(owner, id), 409, "DOCUMENT_NOT_REREADABLE"); // the AI reading is off: typed by hand
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id)).path("rereadable").asBoolean())
                .isFalse();

        fail(id);
        jdbc.update("UPDATE document SET review_status = 'VERIFIED' WHERE id = ?::uuid", id);
        t.assertReason(reread(owner, id), 409, "DOCUMENT_NOT_REREADABLE"); // confirmed documents are final
    }

    @Test
    void aPublishedBatchFreezesItsDocuments() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());
        drain();
        fail(id);
        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", s.batchId());

        t.assertReason(reread(owner, id), 409, "BATCH_PUBLISHED");
        assertThat(status(id)).isEqualTo("FAILED");
    }

    @Test
    void editorsMayReadAgainViewersAndSuppliersMayNot() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());
        drain();
        fail(id);

        for (UserRole role : List.of(UserRole.VIEWER, UserRole.SUPPLIER)) {
            assertThat(reread(fixtures.member(owner, role), id)).as(role.name()).hasStatus(403);
        }
        assertThat(status(id)).isEqualTo("FAILED");
        assertThat(reread(fixtures.member(owner, UserRole.EDITOR), id)).hasStatus(202);
    }

    @Test
    void needsASignedInUser() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());
        drain();
        fail(id);

        assertThat(fixtures.mvc().post().uri("/api/v1/documents/" + id + "/reread").exchange()).hasStatus(401);
    }

    @Test
    void anotherCompanysDocumentIsNotFoundAndStaysFailed() throws IOException {
        Tenant owner = fixtures.tenant();
        Tenant stranger = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep());
        drain();
        fail(id);

        assertThat(reread(stranger, id)).hasStatus(404);
        assertThat(reread(owner, "00000000-0000-0000-0000-000000000000")).hasStatus(404);
        assertThat(status(id)).isEqualTo("FAILED");
    }
}
