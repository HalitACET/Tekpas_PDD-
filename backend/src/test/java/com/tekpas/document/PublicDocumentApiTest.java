package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFiles;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Documents through a data request link (PLAN M5 T2, design v0.5 49–55): the supplier never sees a reading. */
@IntegrationTest
class PublicDocumentApiTest {

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

    @Test
    void aSupplierUploadBelongsToTheManufacturerAndNamesTheSupplier() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        byte[] bytes = TestFiles.pdf(3);

        MvcTestResult result = t.publicUpload(token, bytes, "GOTS_sertifika.pdf", "application/pdf");

        assertThat(result).hasStatus(201);
        JsonNode doc = fixtures.body(result);
        assertThat(doc.propertyNames()).containsExactlyInAnyOrder("id", "fileName", "sizeBytes", "uploadedAt",
                "previous");
        assertThat(doc.path("fileName").asString()).isEqualTo("GOTS_sertifika.pdf");
        assertThat(doc.path("sizeBytes").asLong()).isEqualTo(bytes.length);
        assertThat(doc.path("previous").asBoolean()).isFalse();

        String id = doc.path("id").asString();
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM document WHERE id = ?::uuid", id);
        assertThat(row.get("company_id").toString()).isEqualTo(owner.company().getId().toString());
        assertThat(row.get("step_id").toString()).isEqualTo(s.yarnStep());
        assertThat(row.get("request_id")).isNotNull();
        assertThat(row.get("uploaded_by")).isNull();
        assertThat(row.get("uploaded_by_name")).isEqualTo(s.supplierName());
        assertThat(row.get("doc_type")).isEqualTo("UNKNOWN");
        assertThat(row.get("extraction_status")).isEqualTo("QUEUED");
        assertThat(storage.objects()).containsOnlyKeys("docs/" + owner.company().getId() + "/" + id);
        assertThat(jdbc.queryForObject("SELECT actor_name FROM step_event WHERE step_id = ?::uuid "
                + "AND kind = 'DOCUMENT_UPLOADED'", String.class, s.yarnStep())).isEqualTo(s.supplierName());
    }

    @Test
    void theManufacturerSeesTheSupplierUploadWithItsSource() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        t.publicPdf(t.link(owner, s.yarnStep()));

        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/steps/" + s.yarnStep() + "/documents"));

        assertThat(list).hasSize(1);
        assertThat(list.get(0).path("source").asString()).isEqualTo("SUPPLIER_LINK");
        assertThat(list.get(0).path("uploadedByName").asString()).isEqualTo(s.supplierName());
    }

    @Test
    void theLinkViewListsUploadsWithAnAllowListOfFieldsAndNeverAReading() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        String id = fixtures.body(t.publicPdf(token)).path("id").asString();
        // The reading finished, found a certificate and failed once: none of it may reach the supplier.
        jdbc.update("""
                UPDATE document SET extraction_status = 'READ', doc_type = 'OEKO_TEX', cert_no = 'DEMO-SECRET-123',
                       holder_name = 'Gizli Sahip A.S.', extraction_method = 'TEXT_RULES', failure_code = 'NO_TEXT_LAYER',
                       extraction = '{"detectedType":"OEKO_TEX","method":"TEXT_RULES","warnings":[],"fields":{"certNo":{"value":"DEMO-SECRET-123","confidence":0.97,"source":"TEXT_RULES","evidence":{"page":1,"snippet":"Certificate No.: DEMO-SECRET-123"}}}}'::jsonb
                WHERE id = ?::uuid
                """, id);

        MvcTestResult view = t.publicOpen(token);

        assertThat(view).hasStatusOk();
        JsonNode documents = fixtures.body(view).path("documents");
        assertThat(documents).hasSize(1);
        assertThat(documents.get(0).propertyNames()).containsExactlyInAnyOrder("id", "fileName", "sizeBytes",
                "uploadedAt", "previous");
        String text = fixtures.responseText(view);
        assertThat(text).doesNotContain("DEMO-SECRET-123", "Gizli Sahip", "OEKO_TEX", "NO_TEXT_LAYER", "confidence",
                "extraction", "failureCode", "reviewStatus");
        assertThat(fixtures.body(t.publicUpload(token, TestFiles.png(), "foto.png", "image/png")).propertyNames())
                .doesNotContain("extractionStatus", "docType", "failureCode");
    }

    @Test
    void aLinkTakesFiveDocumentsAndAStepTen() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        for (int i = 0; i < 5; i++) {
            assertThat(t.publicPdf(token)).hasStatus(201);
        }
        t.assertReason(t.publicPdf(token), 409, "DOCUMENT_LIMIT");

        for (int i = 0; i < 5; i++) {
            assertThat(t.uploadPdf(owner, s.yarnStep())).hasStatus(202);
        }
        // The panel filled the step up: the link has room for itself but not for the step.
        String second = t.link(owner, s.yarnStep());
        t.assertReason(t.publicPdf(second), 409, "DOCUMENT_LIMIT");
        assertThat(storage.objects()).hasSize(10);
    }

    @Test
    void aFileThePanelAlreadyUploadedIsADuplicate() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        byte[] bytes = TestFiles.pdf();
        assertThat(t.upload(owner, s.yarnStep(), bytes, "a.pdf", "application/pdf")).hasStatus(202);

        t.assertReason(t.publicUpload(t.link(owner, s.yarnStep()), bytes, "b.pdf", "application/pdf"), 409,
                "DUPLICATE_DOCUMENT");

        assertThat(storage.objects()).hasSize(1);
    }

    @Test
    void aRefusedFileStoresNothing() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());

        t.assertFileError(t.publicUpload(token, "MZ-not-a-pdf".getBytes(), "x.pdf", "application/pdf"), 415, "FileType");
        t.assertFileError(t.publicUpload(token, TestFiles.encryptedPdf(), "e.pdf", "application/pdf"), 400,
                "FileEncrypted");
        t.assertFileError(t.publicUpload(token, TestFiles.pdf(21), "21.pdf", "application/pdf"), 400, "FilePages");
        byte[] big = new byte[10 * 1024 * 1024 + 1];
        System.arraycopy(TestFiles.pdf(), 0, big, 0, 8);
        t.assertFileError(t.publicUpload(token, big, "big.pdf", "application/pdf"), 413, "FileTooLarge");

        assertThat(storage.objects()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Integer.class,
                s.yarnStep())).isZero();
    }

    @Test
    void theHolderRemovesOnlyTheLinksOwnUploadsBeforeSubmitting() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        String mine = fixtures.body(t.publicPdf(token)).path("id").asString();
        String panelDoc = fixtures.body(t.uploadPdf(owner, s.yarnStep())).path("id").asString();
        String otherStepDoc = fixtures.body(t.uploadPdf(owner, s.fabricStep())).path("id").asString();

        assertThat(t.publicDelete(token, panelDoc)).hasStatus(404);
        assertThat(t.publicDelete(token, otherStepDoc)).hasStatus(404);
        assertThat(t.publicDelete(token, java.util.UUID.randomUUID().toString())).hasStatus(404);
        assertThat(storage.objects()).hasSize(3);

        assertThat(t.publicDelete(token, mine)).hasStatus(204);

        assertThat(storage.objects()).hasSize(2);
        assertThat(fixtures.body(t.publicOpen(token)).path("documents")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM step_event WHERE step_id = ?::uuid "
                + "AND kind = 'DOCUMENT_REMOVED'", Integer.class, s.yarnStep())).isEqualTo(1);
        assertThat(fixtures.get(owner, "/api/v1/documents/" + panelDoc)).hasStatusOk();
    }

    @Test
    void anotherLinkCannotTouchTheDocuments() {
        Tenant owner = fixtures.tenant();
        Tenant stranger = fixtures.tenant();
        Setup s = t.setup(owner);
        Setup other = t.setup(stranger);
        String id = fixtures.body(t.publicPdf(t.link(owner, s.yarnStep()))).path("id").asString();
        String strangerToken = t.link(stranger, other.yarnStep());

        assertThat(t.publicDelete(strangerToken, id)).hasStatus(404);
        assertThat(fixtures.body(t.publicOpen(strangerToken)).path("documents")).isEmpty();
        assertThat(storage.objects()).hasSize(1);
    }

    @Test
    void aClosedLinkTakesNoUploadsAndNoRemovals() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String submitted = t.link(owner, s.yarnStep());
        String id = fixtures.body(t.publicPdf(submitted)).path("id").asString();
        assertThat(t.publicSubmit(submitted)).hasStatusOk();

        t.assertReason(t.publicPdf(submitted), 410, "ALREADY_SUBMITTED");
        t.assertReason(t.publicDelete(submitted, id), 410, "ALREADY_SUBMITTED");
        assertThat(storage.objects()).hasSize(1);

        Setup r = t.setup(owner);
        String revokedToken = t.link(owner, r.yarnStep());
        String requestId = jdbc.queryForObject("SELECT id::text FROM data_request WHERE step_id = ?::uuid",
                String.class, r.yarnStep());
        assertThat(fixtures.post(owner, "/api/v1/requests/" + requestId + "/revoke", Map.of())).hasStatus(204);
        t.assertReason(t.publicPdf(revokedToken), 410, "LINK_REVOKED");

        Setup e = t.setup(owner);
        String expiring = t.link(owner, e.yarnStep());
        clock.advance(Duration.ofDays(8));
        t.assertReason(t.publicPdf(expiring), 410, "LINK_EXPIRED");

        assertThat(storage.objects()).hasSize(1);
    }

    @Test
    void anUnknownOrMissingTokenIsNotFound() {
        t.assertReason(t.publicPdf("A".repeat(43)), 404, "LINK_INVALID");
        t.assertReason(t.publicPdf("short"), 404, "LINK_INVALID");
        MvcTestResult noHeader = fixtures.mvc().post().uri("/api/v1/public/request/documents").multipart()
                .file(new org.springframework.mock.web.MockMultipartFile("file", "a.pdf", "application/pdf",
                        TestFiles.pdf()))
                .header("X-Forwarded-For", DocumentTestSupport.randomIp() + ", 10.0.0.1").exchange();
        t.assertReason(noHeader, 404, "LINK_INVALID");
        assertThat(storage.objects()).isEmpty();
    }

    @Test
    void afterACorrectionRequestEarlierUploadsAreReadOnlyAndNewOnesCanBeRemoved() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String first = t.link(owner, s.yarnStep());
        String old = fixtures.body(t.publicPdf(first)).path("id").asString();
        assertThat(t.publicSubmit(first)).hasStatusOk();
        assertThat(fixtures.post(owner, "/api/v1/steps/" + s.yarnStep() + "/reject",
                Map.of("reason", "Belge okunaksız."))).hasStatusOk();
        String second = t.link(owner, s.yarnStep());

        String fresh = fixtures.body(t.publicPdf(second)).path("id").asString();

        JsonNode documents = fixtures.body(t.publicOpen(second)).path("documents");
        assertThat(documents).hasSize(2);
        assertThat(documents.get(0).path("id").asString()).isEqualTo(old);
        assertThat(documents.get(0).path("previous").asBoolean()).isTrue();
        assertThat(documents.get(1).path("id").asString()).isEqualTo(fresh);
        assertThat(documents.get(1).path("previous").asBoolean()).isFalse();
        assertThat(t.publicDelete(second, old)).hasStatus(404);
        assertThat(t.publicDelete(second, fresh)).hasStatus(204);
        // Each link has its own five: the new one starts at zero although the step holds the earlier file.
        for (int i = 0; i < 5; i++) {
            assertThat(t.publicPdf(second)).hasStatus(201);
        }
        t.assertReason(t.publicPdf(second), 409, "DOCUMENT_LIMIT");
    }

    @Test
    void uploadsPerTokenAreLimitedAndRejectedFilesCountToo() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        for (int i = 0; i < 20; i++) {
            assertThat(t.publicUpload(token, new byte[] {1, 2, 3}, "x.pdf", "application/pdf")).hasStatus(415);
        }

        MvcTestResult limited = t.publicPdf(token);

        assertThat(limited).hasStatus(429);
        assertThat(limited.getResponse().getHeader(HttpHeaders.RETRY_AFTER)).isNotNull();
        // Another link is not affected.
        String other = t.link(owner, t.setup(owner).yarnStep());
        assertThat(t.publicPdf(other)).hasStatus(201);
    }

    @Test
    void withoutStorageTheSupplierGetsA503AndNothingIsSaved() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());
        storage.unavailable(true);

        MvcTestResult result = t.publicPdf(token);

        assertThat(result).hasStatus(503);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Integer.class,
                s.yarnStep())).isZero();
    }

    @Test
    void publicDocumentResponsesAreNeverCachedOrIndexed() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String token = t.link(owner, s.yarnStep());

        MvcTestResult upload = t.publicPdf(token);

        Set<String> headers = Set.copyOf(upload.getResponse().getHeaderNames());
        assertThat(upload.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
        assertThat(headers).contains("X-Robots-Tag");
        assertThat(List.of(upload.getResponse().getHeader("X-Robots-Tag"))).first().asString().contains("noindex");
    }
}
