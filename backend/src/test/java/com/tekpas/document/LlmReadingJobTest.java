package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.ai.AiException;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeAiClient;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The LLM step of the reading job (M5 T5) with the LLM switched on and a key set, so only the company decides:
 * a demo company's scan is read by the (fake) LLM into a proposal, any other company's document never reaches it.
 * Quota, refusals and timeouts fall back to manual entry; nothing the LLM says is applied.
 */
@IntegrationTest
@TestPropertySource(properties = {
        "tekpas.ai.llm.enabled=true",
        "tekpas.ai.llm.daily-limit=1000",
        "tekpas.ai.gemini.api-key=" + LlmReadingJobTest.KEY,
        "tekpas.ai.gemini.model=gemini-test-model"})
class LlmReadingJobTest {

    static final String KEY = "test-key-not-a-secret";
    private static final Path ANSWERS = Path.of("src/test/resources/documents/llm");

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    FakeAiClient ai;

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
        ai.reset();
        jdbc.update("DELETE FROM llm_usage");
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
        ai.reset();
        clock.reset();
        jdbc.update("DELETE FROM llm_usage");
    }

    private static byte[] fixture(String name) throws IOException {
        try (InputStream in = LlmReadingJobTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).isNotNull();
            return in.readAllBytes();
        }
    }

    private static String recorded(String name) throws IOException {
        return Files.readString(ANSWERS.resolve(name), StandardCharsets.UTF_8);
    }

    private Tenant demoTenant() {
        Tenant tenant = fixtures.tenant();
        jdbc.update("UPDATE company SET is_demo = TRUE WHERE id = ?", tenant.company().getId());
        return tenant;
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes (their files are gone: they end FAILED)
        }
    }

    private String upload(Tenant owner, String stepId, String name) throws IOException {
        String type = name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
        return fixtures.body(t.upload(owner, stepId, fixture(name), name, type)).path("id").asString();
    }

    private JsonNode document(Tenant owner, String id) {
        return fixtures.body(fixtures.get(owner, "/api/v1/documents/" + id));
    }

    private Map<String, Object> job(String documentId) {
        return jdbc.queryForMap("SELECT status, attempts, last_error FROM job WHERE type = 'AI_EXTRACT_DOCUMENT' "
                + "AND payload->>'documentId' = ? ORDER BY id DESC LIMIT 1", documentId);
    }

    @Test
    void aDocumentOfACompanyThatIsNotADemoNeverReachesTheLlm() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String scan = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");
        String photo = upload(owner, s.yarnStep(), "photo-certificate.jpg");
        String letter = upload(owner, s.yarnStep(), "injection-letter.pdf");

        drain();

        assertThat(ai.calls()).isZero();
        assertThat(document(owner, scan).path("failureCode").asString()).isEqualTo("NO_TEXT_LAYER");
        assertThat(document(owner, photo).path("failureCode").asString()).isEqualTo("NO_TEXT_LAYER");
        assertThat(document(owner, letter).path("failureCode").asString()).isEqualTo("NO_KNOWN_FIELDS");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM llm_usage", Integer.class)).isZero();
    }

    @Test
    void aDemoCompanysScanBecomesAProposalAndNothingIsApplied() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.answer(recorded("scanned-oekotex.answer.json"));
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");

        drain();

        assertThat(ai.calls()).isEqualTo(1);
        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("READ");
        assertThat(doc.path("extractionMethod").asString()).isEqualTo("LLM");
        JsonNode fields = doc.path("extraction").path("fields");
        assertThat(fields.path("certNo").path("value").asString()).isEqualTo("DEMO-OT-2026-0417");
        assertThat(fields.path("certNo").path("source").asString()).isEqualTo("LLM");
        assertThat(fields.valueStream().filter(f -> !f.isNull()).map(f -> f.path("confidence").asDouble()))
                .isNotEmpty().allSatisfy(c -> assertThat(c).isLessThan(0.8));
        // A proposal only: the type, the review and the real fields wait for a person (T6).
        assertThat(doc.path("docType").asString()).isEqualTo("UNKNOWN");
        assertThat(doc.path("reviewStatus").asString()).isEqualTo("UNREVIEWED");
        Map<String, Object> row = jdbc.queryForMap("SELECT cert_no, holder_name, issuer, valid_from, valid_until, "
                + "extraction_model FROM document WHERE id = ?::uuid", id);
        assertThat(row).containsEntry("extraction_model", FakeAiClient.MODEL);
        row.remove("extraction_model");
        assertThat(row.values()).containsOnlyNulls();
        assertThat(job(id)).containsEntry("status", "DONE");
    }

    @Test
    void anInjectedInstructionGetsNoFurtherThanTheProposal() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.answer(recorded("injection-letter.answer.json"));
        String id = upload(owner, s.yarnStep(), "injection-letter.pdf");

        drain();

        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("PARTIAL");
        assertThat(doc.path("docType").asString()).isEqualTo("UNKNOWN");
        assertThat(doc.path("reviewStatus").asString()).isEqualTo("UNREVIEWED");
        assertThat(doc.path("extraction").path("detectedType").asString()).isEqualTo("OEKO_TEX");
        assertThat(doc.path("extraction").path("fields").path("validUntil").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT extraction::text FROM document WHERE id = ?::uuid", String.class, id))
                .doesNotContain("2099", "GOTS", "VERIFIED", "approvedBy");
        assertThat(jdbc.queryForObject("SELECT review_status FROM document WHERE id = ?::uuid", String.class, id))
                .isEqualTo("UNREVIEWED");
    }

    @Test
    void aTextCertificateTheRulesReadNeverGoesToTheLlm() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        String id = upload(owner, s.yarnStep(), "oekotex-standard100.pdf");

        drain();

        assertThat(ai.calls()).isZero();
        assertThat(document(owner, id).path("extractionMethod").asString()).isEqualTo("TEXT_RULES");
    }

    @Test
    void aQuotaAnswerFallsBackToManualEntryAtOnce() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.fail(AiException.Kind.RATE_LIMITED);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");

        drain();
        clock.advance(Duration.ofMinutes(15));
        drain();

        assertThat(ai.calls()).isEqualTo(1);
        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("UNREADABLE");
        assertThat(doc.path("failureCode").asString()).isEqualTo("LLM_UNAVAILABLE");
        assertThat(doc.path("extractionMethod").asString()).isEqualTo("NONE");
        assertThat(job(id)).containsEntry("status", "DONE");
    }

    @Test
    void timeoutsAreRetriedAFewTimesThenLeftForManualEntry() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.fail(AiException.Kind.UNAVAILABLE);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");

        drain();
        Map<String, Object> retrying = job(id);
        assertThat(retrying).containsEntry("status", "QUEUED");
        // What is stored about the failed attempt names the failure, not the key or the document.
        assertThat(String.valueOf(retrying.get("last_error"))).contains("LLM call failed")
                .doesNotContain(KEY, "Ornek", "DEMO-OT");
        assertThat(document(owner, id).path("extractionStatus").asString()).isEqualTo("RUNNING");
        clock.advance(Duration.ofSeconds(31));
        drain();
        clock.advance(Duration.ofMinutes(3));
        drain();

        assertThat(ai.calls()).isEqualTo(3);
        JsonNode doc = document(owner, id);
        assertThat(doc.path("extractionStatus").asString()).isEqualTo("UNREADABLE");
        assertThat(doc.path("failureCode").asString()).isEqualTo("LLM_UNAVAILABLE");
        Map<String, Object> job = job(id);
        assertThat(job).containsEntry("status", "DONE");
        assertThat(((Number) job.get("attempts")).intValue()).isEqualTo(3);
    }

    @Test
    void aSecondAttemptCanStillRead() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.fail(AiException.Kind.UNAVAILABLE).answer(recorded("scanned-oekotex.answer.json"));
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");

        drain();
        clock.advance(Duration.ofSeconds(31));
        drain();

        assertThat(ai.calls()).isEqualTo(2);
        assertThat(document(owner, id).path("extractionMethod").asString()).isEqualTo("LLM");
    }

    @Test
    void theDailyLimitStopsCallsBeforeTheyAreMade() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of("America/Los_Angeles"));
        jdbc.update("INSERT INTO llm_usage (day, calls) VALUES (?, 1000)", today);
        String id = upload(owner, s.yarnStep(), "scanned-oekotex.pdf");

        drain();

        assertThat(ai.calls()).isZero();
        assertThat(document(owner, id).path("failureCode").asString()).isEqualTo("LLM_UNAVAILABLE");
    }

    @Test
    void eachCallCountsAgainstTheDailyLimit() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.answer(recorded("scanned-oekotex.answer.json"));
        upload(owner, s.yarnStep(), "scanned-oekotex.pdf");
        upload(owner, s.yarnStep(), "photo-certificate.jpg");

        drain();

        assertThat(ai.calls()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT SUM(calls) FROM llm_usage", Integer.class)).isEqualTo(2);
    }

    @Test
    void theSupplierPageCarriesTheFlagOnlyForADemoCompany() {
        Tenant demo = demoTenant();
        Tenant real = fixtures.tenant();
        String demoToken = t.link(demo, t.setup(demo).yarnStep());
        String realToken = t.link(real, t.setup(real).yarnStep());

        JsonNode demoView = fixtures.body(t.publicOpen(demoToken));
        JsonNode realView = fixtures.body(t.publicOpen(realToken));

        // The flag is all the page learns: the warning "Demo ortamı: gerçek belge yüklemeyin" (design A5).
        assertThat(demoView.path("aiReading").asBoolean()).isTrue();
        assertThat(realView.path("aiReading").asBoolean()).isFalse();
        assertThat(fixtures.responseText(t.publicOpen(demoToken))).doesNotContain("is_demo", "isDemo", "gemini",
                FakeAiClient.MODEL);
    }

    @Test
    void theSupplierNeverSeesTheLlmReading() throws IOException {
        Tenant owner = demoTenant();
        Setup s = t.setup(owner);
        ai.answer(recorded("scanned-oekotex.answer.json"));
        String token = t.link(owner, s.yarnStep());
        assertThat(t.publicUpload(token, fixture("scanned-oekotex.pdf"), "tarama.pdf", "application/pdf"))
                .hasStatus(201);

        drain();

        assertThat(ai.calls()).isEqualTo(1);
        String view = fixtures.responseText(t.publicOpen(token));
        assertThat(view).doesNotContain("DEMO-OT-2026-0417", "Ornek Iplik", "LLM", "confidence", "extraction",
                FakeAiClient.MODEL);
    }
}
