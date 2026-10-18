package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Confirming what was read (M5 T6, design v0.5 57): only OWNER and ADMIN, the person's values become the real
 * fields, every field is recorded as accepted, edited or added, the step gets a DOCUMENT_VERIFIED event, and the
 * reading's own proposal stays as it was. Manual entry (nothing readable) is the same call.
 */
@IntegrationTest
class DocumentVerifyTest {

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
        try (InputStream in = DocumentVerifyTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).isNotNull();
            return in.readAllBytes();
        }
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    private String upload(Tenant owner, String stepId, String name) throws IOException {
        String type = name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
        return fixtures.body(t.upload(owner, stepId, fixture(name), name, type)).path("id").asString();
    }

    private MvcTestResult verify(Tenant who, String id, Map<String, Object> body) {
        return fixtures.post(who, "/api/v1/documents/" + id + "/verify", body);
    }

    private static Map<String, Object> values(String docType, String certNo, String holder, String issuer,
            String from, String until) {
        Map<String, Object> body = new HashMap<>();
        body.put("docType", docType);
        body.put("certNo", certNo);
        body.put("holderName", holder);
        body.put("issuer", issuer);
        body.put("validFrom", from);
        body.put("validUntil", until);
        return body;
    }

    /** What the rules read from {@code oekotex-standard100.pdf}, as a person who agrees would send it back. */
    private static Map<String, Object> agreeing() {
        return values("OEKO_TEX", "DEMO-OT-2026-0417", "Ornek Iplik San. ve Tic. A.S., Bursa, Turkiye",
                "Demo Textile Testing Institute (fictional)", "2026-04-01", "2027-03-31");
    }

    /** 422: well formed, but a certificate without these cannot be confirmed; one NotNull error per field. */
    private void assertRequired(MvcTestResult result, String... fields) {
        assertThat(result).hasStatus(422);
        JsonNode problem = fixtures.body(result);
        assertThat(problem.path("errors").valueStream().map(e -> e.path("field").asString()))
                .containsExactlyInAnyOrder(fields);
        assertThat(problem.path("errors").valueStream().map(e -> e.path("code").asString())).containsOnly("NotNull");
    }

    private void assertField(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream()).anySatisfy(e -> {
            assertThat(e.path("field").asString()).isEqualTo(field);
            assertThat(e.path("code").asString()).isEqualTo(code);
        });
    }

    @Test
    void keepingTheProposalMakesItTheDocumentsRealFieldsAndRecordsWhoAndWhen() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();
        JsonNode before = fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id));
        assertThat(before.path("reviewStatus").asString()).isEqualTo("UNREVIEWED");
        assertThat(before.path("certNo").isNull()).isTrue();

        MvcTestResult result = verify(owner, id, agreeing());

        assertThat(result).hasStatusOk();
        JsonNode doc = fixtures.body(result);
        assertThat(doc.path("reviewStatus").asString()).isEqualTo("VERIFIED");
        assertThat(doc.path("docType").asString()).isEqualTo("OEKO_TEX");
        assertThat(doc.path("certNo").asString()).isEqualTo("DEMO-OT-2026-0417");
        assertThat(doc.path("holderName").asString()).startsWith("Ornek Iplik");
        assertThat(doc.path("issuer").asString()).startsWith("Demo Textile");
        assertThat(doc.path("validFrom").asString()).isEqualTo("2026-04-01");
        assertThat(doc.path("validUntil").asString()).isEqualTo("2027-03-31");
        assertThat(doc.path("verifiedByName").asString()).isEqualTo(owner.user().getFullName());
        assertThat(doc.path("verifiedAt").isNull()).isFalse();
        JsonNode checks = doc.path("verification");
        for (String field : List.of("docType", "certNo", "holderName", "issuer", "validFrom", "validUntil")) {
            assertThat(checks.path(field).asString()).as(field).isEqualTo("ACCEPTED");
        }
        // The reading's proposal is what it was; only the confirmation was added.
        assertThat(doc.path("extraction")).isEqualTo(before.path("extraction"));
        assertThat(doc.path("extractedAt")).isEqualTo(before.path("extractedAt"));
        assertThat(jdbc.queryForObject("SELECT verified_by FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo(owner.user().getId().toString());
        // A later read says the same, with the name.
        JsonNode again = fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id));
        assertThat(again.path("verifiedByName").asString()).isEqualTo(owner.user().getFullName());
        assertThat(fixtures.body(fixtures.get(owner, "/api/v1/steps/" + s.yarnStep() + "/documents")).get(0)
                .path("verifiedByName").asString()).isEqualTo(owner.user().getFullName());
    }

    @Test
    void theStepHistoryGetsADocumentVerifiedEvent() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();

        assertThat(verify(owner, id, agreeing())).hasStatusOk();

        Map<String, Object> event = jdbc.queryForMap("SELECT kind, actor_user_id::text AS actor, actor_name, "
                + "detail->>'documentId' AS document, detail->>'docType' AS type FROM step_event "
                + "WHERE step_id = ?::uuid AND kind = 'DOCUMENT_VERIFIED'", s.yarnStep());
        assertThat(event).containsEntry("actor", owner.user().getId().toString())
                .containsEntry("actor_name", owner.user().getFullName()).containsEntry("document", id)
                .containsEntry("type", "OEKO_TEX");
    }

    @Test
    void correctedAndTypedFieldsAreToldApartFromAcceptedOnes() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        // Found: number and holder. Not found: issuer, both dates.
        String id = upload(owner, s.yarnStep(), "oekotex-partial.pdf");
        drain();
        JsonNode proposal = fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id)).path("extraction");
        assertThat(proposal.path("fields").path("issuer").isNull()).isTrue();

        Map<String, Object> body = values("OEKO_TEX", "DEMO-OT-2026-0500", "Ornek Iplik Anonim Sirketi",
                "Demo Textile Testing Institute (fictional)", null, "2027-05-31");
        JsonNode checks = fixtures.body(verify(owner, id, body)).path("verification");

        assertThat(checks.path("docType").asString()).isEqualTo("ACCEPTED");
        assertThat(checks.path("certNo").asString()).isEqualTo("ACCEPTED");
        assertThat(checks.path("holderName").asString()).isEqualTo("EDITED");
        assertThat(checks.path("issuer").asString()).isEqualTo("ADDED");
        assertThat(checks.path("validFrom").isNull()).isTrue();
        assertThat(checks.path("validUntil").asString()).isEqualTo("ADDED");
    }

    @Test
    void aProposedValueTheFormLeavesEmptyIsAnEditAndStaysEmpty() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();

        // Nothing is taken from the proposal on the person's behalf: the body is the whole truth.
        JsonNode doc = fixtures.body(verify(owner, id, values("TECH_SHEET", null, null, null, null, null)));

        assertThat(doc.path("reviewStatus").asString()).isEqualTo("VERIFIED");
        assertThat(doc.path("docType").asString()).isEqualTo("TECH_SHEET");
        assertThat(doc.path("verification").path("docType").asString()).isEqualTo("EDITED");
        assertThat(doc.path("certNo").isNull()).isTrue();
        assertThat(doc.path("validUntil").isNull()).isTrue();
        assertThat(doc.path("verification").path("certNo").asString()).isEqualTo("EDITED");
        assertThat(doc.path("verification").path("validUntil").asString()).isEqualTo("EDITED");
        assertThat(doc.path("extraction").path("fields").path("certNo").path("value").asString())
                .isEqualTo("DEMO-OT-2026-0417");
    }

    @Test
    void manualEntryOfAScanIsTheSameCall() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");
        drain();
        JsonNode before = fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id));
        assertThat(before.path("extractionStatus").asString()).isEqualTo("UNREADABLE");

        JsonNode doc = fixtures.body(verify(owner, id, agreeing()));

        assertThat(doc.path("reviewStatus").asString()).isEqualTo("VERIFIED");
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("UNREADABLE");
        assertThat(doc.path("extractionMethod").asString()).isEqualTo("NONE");
        for (String field : List.of("docType", "certNo", "holderName", "issuer", "validFrom", "validUntil")) {
            assertThat(doc.path("verification").path(field).asString()).as(field).isEqualTo("ADDED");
        }
    }

    @Test
    void aFailedReadingCanBeConfirmedByHandToo() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        jdbc.update("UPDATE document SET extraction_status = 'FAILED', failure_code = 'EXTRACT_FAILED' "
                + "WHERE id = ?::uuid", id);

        assertThat(verify(owner, id, agreeing())).hasStatusOk();
    }

    @Test
    void aDocumentStillBeingReadCannotBeConfirmedYet() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");

        t.assertReason(verify(owner, id, agreeing()), 409, "DOCUMENT_NOT_READ");

        drain();
        assertThat(verify(owner, id, agreeing())).hasStatusOk();
    }

    @Test
    void aConfirmedDocumentIsFinalAndCannotBeRemoved() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();
        assertThat(verify(owner, id, agreeing())).hasStatusOk();

        Map<String, Object> other = agreeing();
        other.put("certNo", "DEMO-CHANGED");
        t.assertReason(verify(owner, id, other), 409, "DOCUMENT_VERIFIED");
        t.assertReason(fixtures.delete(owner, "/api/v1/documents/" + id), 409, "DOCUMENT_VERIFIED");
        assertThat(jdbc.queryForObject("SELECT cert_no FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("DEMO-OT-2026-0417");
    }

    @Test
    void aPublishedBatchFreezesItsDocuments() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();
        jdbc.update("UPDATE batch SET status = 'PUBLISHED' WHERE id = ?::uuid", s.batchId());

        t.assertReason(verify(owner, id, agreeing()), 409, "BATCH_PUBLISHED");
        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
    }

    @Test
    void onlyOwnersAndAdminsConfirm() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();

        for (UserRole role : List.of(UserRole.EDITOR, UserRole.VIEWER, UserRole.SUPPLIER)) {
            assertThat(verify(fixtures.member(owner, role), id, agreeing())).as(role.name()).hasStatus(403);
        }
        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
        assertThat(verify(fixtures.member(owner, UserRole.ADMIN), id, agreeing())).hasStatusOk();
    }

    @Test
    void confirmingNeedsASignedInUser() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");

        MvcTestResult result = fixtures.mvc().post().uri("/api/v1/documents/" + id + "/verify")
                .contentType("application/json").content(json.writeValueAsString(agreeing())).exchange();

        assertThat(result).hasStatus(401);
    }

    @Test
    void anotherCompanysDocumentIsNotFoundAndStaysUntouched() throws IOException {
        Tenant owner = fixtures.tenant();
        Tenant stranger = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();

        assertThat(verify(stranger, id, agreeing())).hasStatus(404);
        assertThat(verify(owner, "00000000-0000-0000-0000-000000000000", agreeing())).hasStatus(404);

        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM step_event WHERE step_id = ?::uuid "
                + "AND kind = 'DOCUMENT_VERIFIED'", Integer.class, s.yarnStep())).isZero();
    }

    @Test
    void theBodyIsChecked() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        drain();

        Map<String, Object> noType = agreeing();
        noType.remove("docType");
        assertField(verify(owner, id, noType), "docType", "NotNull");
        assertField(verify(owner, id, values("UNKNOWN", "X1", null, null, null, null)), "docType", "OneOf");
        assertField(verify(owner, id, values("OEKO_TEX", null, null, null, "2027-01-01", "2026-01-01")),
                "validUntil", "DateRange");
        assertField(verify(owner, id, values("OEKO_TEX", "1".repeat(101), null, null, null, null)), "certNo", "Size");
        assertField(verify(owner, id, values("OEKO_TEX", null, "A".repeat(201), null, null, null)), "holderName",
                "Size");
        assertThat(verify(owner, id, values("PASSPORT", null, null, null, null, null))).hasStatus(400);
        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
    }

    @Test
    void typedTextIsStoredWithoutControlOrDirectionCharacters() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");
        drain();

        JsonNode doc = fixtures.body(verify(owner, id, values("GOTS", "  GOTS\u202e-55\u0000821  ",
                "Karaca\u200b   Tekstil\n Ltd.", "   ", null, "2027-01-14")));

        assertThat(doc.path("certNo").asString()).isEqualTo("GOTS-55821");
        assertThat(doc.path("holderName").asString()).isEqualTo("Karaca Tekstil Ltd.");
        assertThat(doc.path("issuer").isNull()).isTrue();
        assertThat(doc.path("verification").path("issuer").isNull()).isTrue();
    }

    @Test
    void aCertificateNeedsItsNumberAndItsEndOfValidity() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");
        drain();

        for (String type : List.of("OEKO_TEX", "GOTS", "GRS", "BCI", "OCS", "BLUESIGN")) {
            MvcTestResult none = verify(owner, id, values(type, null, "Ornek A.S.", null, "2026-01-01", null));
            assertRequired(none, "certNo", "validUntil");
        }
        assertRequired(verify(owner, id, values("GOTS", "GOTS-1", null, null, null, null)), "validUntil");
        assertRequired(verify(owner, id, values("GOTS", null, null, null, null, "2027-01-01")), "certNo");
        // Blank is empty, whatever the spaces and invisible characters.
        assertRequired(verify(owner, id, values("GRS", " \u200b  ", null, null, null, "2027-01-01")), "certNo");
        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM step_event WHERE step_id = ?::uuid "
                + "AND kind = 'DOCUMENT_VERIFIED'", Integer.class, s.yarnStep())).isZero();

        // With both, the same call goes through; the holder, issuer and start stay optional.
        assertThat(verify(owner, id, values("GOTS", "DEMO-GOTS-1", null, null, null, "2027-01-14")))
                .hasStatusOk();
    }

    @Test
    void otherTypesNeedNeitherANumberNorAValidity() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        for (String type : List.of("TECH_SHEET", "LAB_REPORT", "SDS", "INVOICE", "OTHER")) {
            String id = upload(owner, s.yarnStep(), type.equals("TECH_SHEET") ? "technical-sheet.pdf"
                    : type.equals("LAB_REPORT") ? "unknown-letter.pdf" : type.equals("SDS") ? "oekotex-partial.pdf"
                    : type.equals("INVOICE") ? "gots-scope-certificate.pdf" : "oekotex-expired.pdf");
            drain();

            JsonNode doc = fixtures.body(verify(owner, id, values(type, null, null, null, null, null)));

            assertThat(doc.path("reviewStatus").asString()).as(type).isEqualTo("VERIFIED");
            assertThat(doc.path("docType").asString()).isEqualTo(type);
        }
    }

    @Test
    void everyDocumentTypeIsEitherACertificateOrNot() {
        assertThat(java.util.Arrays.stream(DocType.values()).filter(DocType::isCertificate).map(Enum::name))
                .containsExactlyInAnyOrder("OEKO_TEX", "GOTS", "GRS", "BCI", "OCS", "BLUESIGN");
    }

    @Test
    void anExpiredCertificateCanStillBeConfirmed() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-expired.pdf");
        drain();

        JsonNode doc = fixtures.body(verify(owner, id, values("OEKO_TEX", "DEMO-OT-2025-0099",
                "Ornek Orme Kumas A.S., Istanbul, Turkiye", "Demo Textile Testing Institute (fictional)",
                "2025-01-01", "2025-12-31")));

        assertThat(doc.path("reviewStatus").asString()).isEqualTo("VERIFIED");
        assertThat(doc.path("extraction").path("warnings").valueStream().map(JsonNode::asString))
                .contains("EXPIRED");
    }

    @Test
    void theChainCountsDocumentsAndThoseNobodyConfirmed() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String first = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        upload(owner, s.yarnStep(), "gots-scope-certificate.pdf");
        drain();

        JsonNode yarn = step(owner, s, "YARN");
        assertThat(yarn.path("documentCount").asInt()).isEqualTo(2);
        assertThat(yarn.path("unreviewedDocumentCount").asInt()).isEqualTo(2);
        assertThat(step(owner, s, "FABRIC").path("documentCount").asInt()).isZero();

        assertThat(verify(owner, first, agreeing())).hasStatusOk();

        yarn = step(owner, s, "YARN");
        assertThat(yarn.path("documentCount").asInt()).isEqualTo(2);
        assertThat(yarn.path("unreviewedDocumentCount").asInt()).isEqualTo(1);
    }

    @Test
    void anotherCompanyDoesNotSeeTheDocumentsInItsChain() throws IOException {
        Tenant owner = fixtures.tenant();
        Tenant stranger = fixtures.tenant();
        Setup s = t.setup(owner);
        upload(owner, s.yarnStep(), "oekotex-standard100.pdf");

        assertThat(fixtures.get(stranger, "/api/v1/batches/" + s.batchId() + "/chain")).hasStatus(404);
    }

    private JsonNode step(Tenant owner, Setup s, String type) {
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/chain"));
        return chain.path("steps").valueStream().filter(n -> n.path("stepType").asString().equals(type)).findFirst()
                .orElseThrow();
    }
}
