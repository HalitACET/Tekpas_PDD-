package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFiles;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Documents on a step, from the panel (PLAN M5 T2, design v0.5 56–58). */
@IntegrationTest
class DocumentApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    ObjectMapper json;

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

    private static String sha256(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    @Test
    void uploadStoresTheObjectAndTheRowAndQueuesReading() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] bytes = TestFiles.pdf(2);

        MvcTestResult result = t.upload(owner, s.yarnStep(), bytes, "OEKO-TEX Sertifika.pdf", "application/pdf");

        assertThat(result).hasStatus(202);
        JsonNode doc = fixtures.body(result);
        assertThat(doc.path("originalName").asString()).isEqualTo("OEKO-TEX Sertifika.pdf");
        assertThat(doc.path("mimeType").asString()).isEqualTo("application/pdf");
        assertThat(doc.path("sizeBytes").asLong()).isEqualTo(bytes.length);
        assertThat(doc.path("pageCount").asInt()).isEqualTo(2);
        assertThat(doc.path("docType").asString()).isEqualTo("UNKNOWN");
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("QUEUED");
        assertThat(doc.path("reviewStatus").asString()).isEqualTo("UNREVIEWED");
        assertThat(doc.path("source").asString()).isEqualTo("PANEL");
        assertThat(doc.path("uploadedByName").asString()).isEqualTo("Test User");
        assertThat(doc.path("stepId").asString()).isEqualTo(s.yarnStep());

        String id = doc.path("id").asString();
        String key = "docs/" + owner.company().getId() + "/" + id;
        assertThat(storage.objects()).containsOnlyKeys(key);
        assertThat(storage.get(key).bytes()).isEqualTo(bytes);
        assertThat(storage.get(key).contentType()).isEqualTo("application/pdf");

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM document WHERE id = ?::uuid", id);
        assertThat(row.get("company_id").toString()).isEqualTo(owner.company().getId().toString());
        assertThat(row.get("file_key")).isEqualTo(key);
        assertThat(row.get("sha256")).isEqualTo(sha256(bytes));
        assertThat(row.get("uploaded_by").toString()).isEqualTo(owner.user().getId().toString());
        assertThat(row.get("request_id")).isNull();
        assertThat(row.get("extraction_status")).isEqualTo("QUEUED");

        Map<String, Object> event = jdbc.queryForMap(
                "SELECT kind, actor_user_id, detail::text AS detail FROM step_event WHERE step_id = ?::uuid "
                        + "AND kind = 'DOCUMENT_UPLOADED'", s.yarnStep());
        assertThat(event.get("actor_user_id").toString()).isEqualTo(owner.user().getId().toString());
        assertThat((String) event.get("detail")).contains(id).contains("PANEL");

        assertThat(jdbc.queryForObject("SELECT status FROM job WHERE type = 'AI_EXTRACT_DOCUMENT' "
                + "AND payload->>'documentId' = ?", String.class, id)).isEqualTo("QUEUED");
    }

    @Test
    void theTypeParameterIsKeptAndAnUnknownOneIsRefused() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        MvcTestResult ok = fixtures.mvc().post().uri("/api/v1/steps/" + s.yarnStep() + "/documents").multipart()
                .file(new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf",
                        TestFiles.pdf()))
                .param("docType", "OEKO_TEX").header(HttpHeaders.AUTHORIZATION, owner.bearer()).exchange();
        assertThat(ok).hasStatus(202);
        assertThat(fixtures.body(ok).path("docType").asString()).isEqualTo("OEKO_TEX");

        MvcTestResult bad = fixtures.mvc().post().uri("/api/v1/steps/" + s.yarnStep() + "/documents").multipart()
                .file(new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf",
                        TestFiles.pdf()))
                .param("docType", "SECRET").header(HttpHeaders.AUTHORIZATION, owner.bearer()).exchange();
        assertThat(bad).hasStatus(400);
    }

    @Test
    void theNameAndDeclaredTypeDoNotDecideWhatTheFileIs() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        MvcTestResult result = t.upload(owner, s.yarnStep(), TestFiles.png(), "../../sertifika.pdf", "application/pdf");

        assertThat(result).hasStatus(202);
        JsonNode doc = fixtures.body(result);
        assertThat(doc.path("mimeType").asString()).isEqualTo("image/png");
        assertThat(doc.path("originalName").asString()).isEqualTo("sertifika.pdf.png");
        assertThat(storage.objects().values()).singleElement().satisfies(o ->
                assertThat(o.contentType()).isEqualTo("image/png"));
    }

    @Test
    void listAndGetShowTheStepsDocumentsNewestFirst() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String first = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        String second = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        t.uploadPdf(owner, s.fabricStep());

        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/steps/" + s.yarnStep() + "/documents"));

        assertThat(list.valueStream().map(d -> d.path("id").asString())).containsExactly(second, first);
        MvcTestResult one = fixtures.get(owner, "/api/v1/documents/" + first);
        assertThat(one).hasStatusOk();
        assertThat(fixtures.body(one).path("id").asString()).isEqualTo(first);
    }

    @Test
    void anotherCompanysStepAndDocumentsAreNotFound() {
        TenantPair tenants = fixtures.twoTenants();
        Setup s = t.setup(tenants.a());
        String id = fixtures.body(t.uploadPdf(tenants.a(), s.yarnStep())).path("id").asString();
        int objects = storage.objects().size();

        assertThat(t.uploadPdf(tenants.b(), s.yarnStep())).hasStatus(404);
        assertThat(fixtures.get(tenants.b(), "/api/v1/steps/" + s.yarnStep() + "/documents")).hasStatus(404);
        assertThat(fixtures.get(tenants.b(), "/api/v1/documents/" + id)).hasStatus(404);
        assertThat(fixtures.get(tenants.b(), "/api/v1/documents/" + id + "/file")).hasStatus(404);
        assertThat(fixtures.delete(tenants.b(), "/api/v1/documents/" + id)).hasStatus(404);

        assertThat(storage.objects()).hasSize(objects);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE id = ?::uuid", Integer.class, id))
                .isEqualTo(1);
    }

    @Test
    void onlyEditorsAndAboveUploadAndSuppliersDoNothing() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        Tenant editor = fixtures.member(owner, UserRole.EDITOR);
        Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
        Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);

        assertThat(t.uploadPdf(editor, s.yarnStep())).hasStatus(202);
        assertThat(t.uploadPdf(viewer, s.yarnStep())).hasStatus(403);
        assertThat(fixtures.delete(viewer, "/api/v1/documents/" + id)).hasStatus(403);
        assertThat(fixtures.get(viewer, "/api/v1/steps/" + s.yarnStep() + "/documents")).hasStatusOk();
        assertThat(fixtures.get(viewer, "/api/v1/documents/" + id)).hasStatusOk();
        assertThat(t.uploadPdf(supplier, s.yarnStep())).hasStatus(403);
        assertThat(fixtures.get(supplier, "/api/v1/steps/" + s.yarnStep() + "/documents")).hasStatus(403);
        assertThat(fixtures.get(supplier, "/api/v1/documents/" + id)).hasStatus(403);
        assertThat(fixtures.get(supplier, "/api/v1/documents/" + id + "/file")).hasStatus(403);
    }

    @Test
    void uploadsNeedASignedInUser() {
        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/steps/" + java.util.UUID.randomUUID() + "/documents")
                .multipart().file(new org.springframework.mock.web.MockMultipartFile("file", "a.pdf",
                        "application/pdf", TestFiles.pdf())).exchange();

        assertThat(result).hasStatus(401);
    }

    @Test
    void aRefusedFileStoresNothing() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        t.assertFileError(t.upload(owner, s.yarnStep(), "<html>".getBytes(StandardCharsets.UTF_8), "a.pdf",
                "application/pdf"), 415, "FileType");
        t.assertFileError(t.upload(owner, s.yarnStep(), TestFiles.encryptedPdf(), "e.pdf", "application/pdf"), 400,
                "FileEncrypted");
        t.assertFileError(t.upload(owner, s.yarnStep(), TestFiles.corruptPdf(), "c.pdf", "application/pdf"), 400,
                "FileCorrupt");
        t.assertFileError(t.upload(owner, s.yarnStep(), TestFiles.pdf(21), "21.pdf", "application/pdf"), 400,
                "FilePages");
        t.assertFileError(t.upload(owner, s.yarnStep(), TestFiles.pngClaiming(20_000, 20_000), "b.png", "image/png"),
                400, "FileDimensions");
        t.assertFileError(t.upload(owner, s.yarnStep(), new byte[0], "z.pdf", "application/pdf"), 400, "FileEmpty");
        byte[] big = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(TestFiles.pdf(), 0, big, 0, 8);
        t.assertFileError(t.upload(owner, s.yarnStep(), big, "big.pdf", "application/pdf"), 413, "FileTooLarge");

        assertThat(storage.objects()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Integer.class,
                s.yarnStep())).isZero();
    }

    @Test
    void theSameFileOnTheSameStepIsADuplicateButNotOnAnotherStepOrAfterRemoval() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] bytes = TestFiles.pdf();
        String id = fixtures.body(t.upload(owner, s.yarnStep(), bytes, "a.pdf", "application/pdf")).path("id")
                .asString();

        t.assertReason(t.upload(owner, s.yarnStep(), bytes, "renamed.pdf", "application/pdf"), 409,
                "DUPLICATE_DOCUMENT");
        assertThat(storage.objects()).hasSize(1);
        assertThat(t.upload(owner, s.fabricStep(), bytes, "a.pdf", "application/pdf")).hasStatus(202);

        assertThat(fixtures.delete(owner, "/api/v1/documents/" + id)).hasStatus(204);
        assertThat(t.upload(owner, s.yarnStep(), bytes, "a.pdf", "application/pdf")).hasStatus(202);
    }

    @Test
    void aStepHoldsAtMostTenDocuments() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        for (int i = 0; i < 10; i++) {
            assertThat(t.uploadPdf(owner, s.yarnStep())).hasStatus(202);
        }

        t.assertReason(t.uploadPdf(owner, s.yarnStep()), 409, "DOCUMENT_LIMIT");

        assertThat(storage.objects()).hasSize(10);
    }

    @Test
    void twoIdenticalUploadsAtOnceLeaveOneDocumentAndNoStrayObject() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] bytes = TestFiles.pdf();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    go.await();
                    return t.upload(owner, s.yarnStep(), bytes, "a.pdf", "application/pdf").getResponse().getStatus();
                }));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : results) {
                statuses.add(f.get());
            }

            assertThat(statuses).containsExactlyInAnyOrder(202, 409);
            assertThat(storage.objects()).hasSize(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Integer.class,
                    s.yarnStep())).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void storageProblemsAreAnswered503And502AndSaveNothing() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);

        storage.unavailable(true);
        MvcTestResult unavailable = t.uploadPdf(owner, s.yarnStep());
        assertThat(unavailable).hasStatus(503);
        assertThat(fixtures.body(unavailable).path("type").asString()).isEqualTo("urn:tekpas:problem:storage-unavailable");

        storage.unavailable(false);
        storage.failing(true);
        MvcTestResult failed = t.uploadPdf(owner, s.yarnStep());
        assertThat(failed).hasStatus(502);
        assertThat(fixtures.body(failed).path("type").asString()).isEqualTo("urn:tekpas:problem:storage-failed");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Integer.class,
                s.yarnStep())).isZero();
    }

    @Test
    void removalDeletesTheRowTheObjectAndLeavesAnEvent() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();

        assertThat(fixtures.delete(owner, "/api/v1/documents/" + id)).hasStatus(204);

        assertThat(storage.objects()).isEmpty();
        assertThat(fixtures.get(owner, "/api/v1/documents/" + id)).hasStatus(404);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM step_event WHERE step_id = ?::uuid "
                + "AND kind = 'DOCUMENT_REMOVED'", Integer.class, s.yarnStep())).isEqualTo(1);
        assertThat(fixtures.delete(owner, "/api/v1/documents/" + id)).hasStatus(404);
    }

    @Test
    void aVerifiedDocumentStaysAndAPublishedBatchFreezesItsDocuments() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String verified = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        String other = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        jdbc.update("UPDATE document SET review_status = 'VERIFIED' WHERE id = ?::uuid", verified);

        t.assertReason(fixtures.delete(owner, "/api/v1/documents/" + verified), 409, "DOCUMENT_VERIFIED");

        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", s.batchId());
        t.assertReason(t.uploadPdf(owner, s.yarnStep()), 409, "BATCH_PUBLISHED");
        t.assertReason(fixtures.delete(owner, "/api/v1/documents/" + other), 409, "BATCH_PUBLISHED");
        assertThat(storage.objects()).hasSize(2);
    }

    @Test
    void theFileIsReachedThroughAShortSignedLink() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = fixtures.body(t.upload(owner, s.yarnStep(), TestFiles.pdf(), "Sertifika 2026.pdf",
                "application/pdf")).path("id").asString();

        MvcTestResult inline = fixtures.get(owner, "/api/v1/documents/" + id + "/file");
        assertThat(inline).hasStatus(302);
        String location = inline.getResponse().getHeader(HttpHeaders.LOCATION);
        assertThat(location).startsWith("https://storage.test/object/sign/docs/" + owner.company().getId() + "/" + id)
                .contains("ttl=60").doesNotContain("download=");
        assertThat(inline.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");

        MvcTestResult attachment = fixtures.get(owner, "/api/v1/documents/" + id + "/file?download=true");
        assertThat(attachment.getResponse().getHeader(HttpHeaders.LOCATION)).contains("download=Sertifika+2026.pdf");
    }

    @Test
    void withALocalStorageTheBytesComeBackSafely() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] bytes = TestFiles.png();
        String id = fixtures.body(t.upload(owner, s.yarnStep(), bytes, "foto.png", "image/png")).path("id").asString();
        storage.fileUris(true);

        MvcTestResult result = fixtures.get(owner, "/api/v1/documents/" + id + "/file");

        assertThat(result).hasStatusOk();
        assertThat(result.getResponse().getContentAsByteArray()).isEqualTo(bytes);
        assertThat(result.getResponse().getContentType()).isEqualTo("image/png");
        assertThat(result.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(result.getResponse().getHeader("Content-Security-Policy")).isEqualTo("sandbox");
        assertThat(result.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).startsWith("inline");
        MvcTestResult attachment = fixtures.get(owner, "/api/v1/documents/" + id + "/file?download=true");
        assertThat(attachment.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION)).startsWith("attachment");
    }

    @Test
    void rejectedFilesUseUpTheCompanysHourlyAllowance() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        for (int i = 0; i < DocumentService.UPLOADS_PER_COMPANY_PER_HOUR; i++) {
            assertThat(t.upload(owner, s.yarnStep(), new byte[] {1, 2, 3}, "x.pdf", "application/pdf")).hasStatus(415);
        }

        MvcTestResult limited = t.uploadPdf(owner, s.yarnStep());

        assertThat(limited).hasStatus(429);
        assertThat(limited.getResponse().getHeader(HttpHeaders.RETRY_AFTER)).isNotNull();
        Tenant other = fixtures.tenant();
        assertThat(t.uploadPdf(other, t.setup(other).yarnStep())).hasStatus(202);
    }
}
