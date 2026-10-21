package com.tekpas.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.ai.AiException;
import com.tekpas.ai.AiRequest;
import com.tekpas.document.DocumentText;
import com.tekpas.document.reading.PdfText;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeAiClient;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * The AI checks of a batch (M7 T5, docs/m7-plan.md §8) with the LLM switched on and a key set, so only the company
 * decides: a demo company's batch is checked by the (fake) LLM after its rules, any other company's never reaches it.
 * Suggestions are WARNING at most, stored with source AI, and an unchanged batch is not sent twice.
 */
@IntegrationTest
@TestPropertySource(properties = {
        "tekpas.ai.llm.enabled=true",
        "tekpas.ai.llm.daily-limit=1000",
        "tekpas.ai.gemini.api-key=test-key-not-a-secret",
        "tekpas.ai.gemini.model=gemini-test-model"})
class AiValidationTest {

    private static final String YARN_DATA = """
            {"originCountry":"TR","fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":100}],"yarnCount":"Ne 30/1"}""";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeAiClient ai;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    @Autowired
    MutableClock clock;

    record Setup(Tenant owner, String batchId, String yarnStep, String fabricStep) {
    }

    @BeforeEach
    void init() {
        ai.reset();
        storage.reset();
        jdbc.update("DELETE FROM llm_usage");
        drain();
    }

    @AfterEach
    void cleanUp() {
        ai.reset();
        storage.reset();
        clock.reset();
        jdbc.update("DELETE FROM llm_usage");
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    private Setup batch(Tenant owner) {
        String productId = fixtures.body(fixtures.post(owner, "/api/v1/products", Map.of("gtin", TestGtins.gtin13(),
                "name", "Organik Pamuk Polo", "category", "T_SHIRT", "declaredFiberComposition",
                List.of(Map.of("fiber", "ORGANIC_COTTON", "percent", 95), Map.of("fiber", "ELASTANE", "percent", 5)))))
                .path("id").asString();
        String batchId = fixtures.body(fixtures.post(owner, "/api/v1/batches", Map.of("productId", productId,
                "quantity", 10, "producedFrom", "2026-09-01", "producedTo", "2026-09-10"))).path("id").asString();
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batchId + "/chain"));
        String yarn = null;
        String fabric = null;
        for (JsonNode step : chain.path("steps")) {
            if ("YARN".equals(step.path("stepType").asString())) {
                yarn = step.path("id").asString();
            } else if ("FABRIC".equals(step.path("stepType").asString())) {
                fabric = step.path("id").asString();
            }
        }
        jdbc.update("UPDATE supply_step SET status = 'APPROVED', data = ?::jsonb WHERE id = ?::uuid", YARN_DATA, yarn);
        return new Setup(owner, batchId, yarn, fabric);
    }

    private Tenant demo() {
        Tenant tenant = fixtures.tenant();
        jdbc.update("UPDATE company SET is_demo = TRUE WHERE id = ?", tenant.company().getId());
        return tenant;
    }

    private static byte[] gotsPdf() throws IOException {
        try (InputStream in = AiValidationTest.class.getResourceAsStream("/documents/gots-scope-certificate.pdf")) {
            assertThat(in).isNotNull();
            return in.readAllBytes();
        }
    }

    /** A confirmed GOTS of the fabric step, its file in the storage: the check reads its text. */
    private void confirmedGots(Setup s) throws IOException {
        String id = UUID.randomUUID().toString();
        String key = "documents/" + id;
        storage.put(key, gotsPdf(), "application/pdf");
        jdbc.update("""
                INSERT INTO document (id, company_id, step_id, doc_type, file_key, original_name, mime_type, size_bytes,
                    sha256, cert_no, holder_name, valid_from, valid_until, extraction_status, review_status)
                VALUES (?::uuid, ?::uuid, ?::uuid, 'GOTS', ?, 'gots.pdf', 'application/pdf', 1000, ?, 'CU 1047823',
                    'Demirtaş Örme', ?, ?, 'READ', 'VERIFIED')
                """, id, s.owner().company().getId().toString(), s.fabricStep(), key,
                id.replace("-", "") + id.replace("-", "").substring(0, 32),
                java.sql.Date.valueOf(LocalDate.now().minusYears(1)), java.sql.Date.valueOf(LocalDate.now().plusYears(1)));
    }

    /** A line of the certificate's own text, which the sheet must carry for a quote from it to count. */
    private static String lineOfTheCertificate() throws IOException {
        for (String line : PdfText.pages(gotsPdf()).getFirst().split("\\R")) {
            String cleaned = DocumentText.clean(line);
            if (cleaned != null && cleaned.length() > 15) {
                return cleaned.length() > 60 ? cleaned.substring(0, 60).strip() : cleaned;
            }
        }
        throw new IllegalStateException("The fixture has no text");
    }

    private void validate(Setup s) {
        assertThat(fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/validate", Map.of())).hasStatusOk();
        drain();
    }

    private JsonNode issues(Setup s, String status) {
        return fixtures.body(fixtures.get(s.owner(), "/api/v1/batches/" + s.batchId() + "/issues?status=" + status));
    }

    private static JsonNode withCode(JsonNode list, String code) {
        return list.path("issues").valueStream().filter(i -> code.equals(i.path("code").asString())).findFirst()
                .orElse(null);
    }

    private long aiJobs(Setup s) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM job WHERE type = 'AI_VALIDATE_BATCH' AND payload->>'batchId' = ?",
                Long.class, s.batchId());
        return n == null ? 0 : n;
    }

    private String answer(String certificateQuote) {
        // S1 is the fibre step, S2 the yarn, S3 the fabric; D1 the GOTS.
        return """
                {"findings":[
                  {"code":"AI-01","evidence":[{"ref":"D1","quote":%s},{"ref":"S3","quote":"step FABRIC"}]},
                  {"code":"AI-02","evidence":[{"ref":"P","quote":"ELASTANE 5%%"},{"ref":"S2","quote":"\\"percent\\":100"}]},
                  {"code":"AI-02","evidence":[{"ref":"P","quote":"made up by the model"},{"ref":"S2","quote":"ORGANIC"}]}]}
                """.formatted("\"" + certificateQuote.replace("\"", "\\\"") + "\"");
    }

    @Test
    void aDemoBatchGetsTheAiSuggestionsTiedToItsDataAfterTheRules() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        ai.answer(answer(lineOfTheCertificate()));

        validate(s);

        assertThat(ai.calls()).isEqualTo(1);
        JsonNode open = issues(s, "OPEN");
        JsonNode scope = withCode(open, "AI-01");
        assertThat(scope).isNotNull();
        assertThat(scope.path("source").asString()).isEqualTo("AI");
        assertThat(scope.path("severity").asString()).isEqualTo("WARNING");
        assertThat(scope.path("stepId").asString()).isEqualTo(s.fabricStep());
        assertThat(scope.path("params").path("docType").asString()).isEqualTo("GOTS");
        assertThat(scope.path("params").path("confidence").asDouble()).isEqualTo(0.7);
        assertThat(scope.path("params").path("evidence").get(0).path("source").asString()).isEqualTo("DOCUMENT");
        assertThat(scope.path("params").path("evidence").get(0).path("quote").asString()).isEqualTo(lineOfTheCertificate());
        JsonNode contradiction = withCode(open, "AI-02");
        assertThat(contradiction.path("stepId").asString()).isEqualTo(s.yarnStep());
        // The suggestion with a quote the data does not hold was dropped.
        assertThat(open.path("issues").valueStream().filter(i -> "AI".equals(i.path("source").asString()))).hasSize(2);

        // What was sent: the data between markers, the certificate's own text among it, our instruction alone.
        AiRequest request = ai.requests().getFirst();
        String data = ((AiRequest.Text) request.document().getFirst()).text();
        assertThat(data).contains("D1: confirmed document GOTS of S3", lineOfTheCertificate(), "Organik Pamuk Polo");
        assertThat(request.instruction()).doesNotContain("Organik Pamuk Polo");
    }

    @Test
    void anUnchangedBatchIsNotSentAgainAndAChangedOneIs() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        ai.answer(answer(lineOfTheCertificate()));
        validate(s);
        assertThat(ai.calls()).isEqualTo(1);

        validate(s);
        assertThat(ai.calls()).isEqualTo(1);

        jdbc.update("UPDATE supply_step SET data = ?::jsonb WHERE id = ?::uuid",
                YARN_DATA.replace("Ne 30/1", "Ne 24/1"), s.yarnStep());
        validate(s);
        assertThat(ai.calls()).isEqualTo(2);
        // The same suggestions again: still one row each.
        assertThat(issues(s, "ALL").path("issues").valueStream().filter(i -> "AI".equals(i.path("source").asString())))
                .hasSize(2);
    }

    @Test
    void theRulesDoNotCloseTheSuggestionsAndAPersonCanResolveThem() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        ai.answer(answer(lineOfTheCertificate()));
        validate(s);
        String id = withCode(issues(s, "OPEN"), "AI-02").path("id").asString();

        // A rule-only run (the rule job of a change) leaves the AI's rows alone.
        jdbc.update("UPDATE batch SET produced_to = NULL WHERE id = ?::uuid", s.batchId());
        validate(s);
        assertThat(withCode(issues(s, "OPEN"), "AI-02")).isNotNull();

        assertThat(fixtures.post(s.owner(), "/api/v1/issues/" + id + "/resolve", Map.of("note", "Etiket doğru")))
                .hasStatusOk();
        assertThat(withCode(issues(s, "RESOLVED"), "AI-02").path("note").asString()).isEqualTo("Etiket doğru");
        // Suggestions never block: the blocking count is the rules' errors alone (here LIF-01, the label is 95/5).
        JsonNode open = issues(s, "OPEN");
        assertThat(open.path("issues").valueStream().filter(i -> "AI".equals(i.path("source").asString()))
                .map(i -> i.path("severity").asString())).containsOnly("WARNING");
        long ruleErrors = open.path("issues").valueStream().filter(i -> "ERROR".equals(i.path("severity").asString()))
                .count();
        JsonNode score = fixtures.body(fixtures.get(s.owner(), "/api/v1/batches/" + s.batchId() + "/score"));
        JsonNode blocking = score.path("blockers").valueStream().filter(b -> "ISSUES_OPEN".equals(b.path("code").asString()))
                .findFirst().orElseThrow();
        assertThat(blocking.path("count").asLong()).isEqualTo(ruleErrors);
        assertThat(open.path("open").path("errors").asLong()).isEqualTo(ruleErrors);
    }

    @Test
    void aBatchWithNothingDeclaredOrConfirmedIsNotSent() {
        Setup s = batch(demo());
        jdbc.update("UPDATE supply_step SET data = '{}'::jsonb WHERE id = ?::uuid", s.yarnStep());

        validate(s);

        assertThat(aiJobs(s)).isPositive();
        assertThat(ai.calls()).isZero();
    }

    @Test
    void aCompanyThatIsNotADemoNeverReachesTheLlm() throws IOException {
        Setup s = batch(fixtures.tenant());
        confirmedGots(s);
        ai.answer(answer(lineOfTheCertificate()));

        validate(s);

        assertThat(aiJobs(s)).isZero();
        assertThat(ai.calls()).isZero();
        assertThat(issues(s, "ALL").path("issues").valueStream().filter(i -> "AI".equals(i.path("source").asString())))
                .isEmpty();
    }

    @Test
    void theDailyLimitStopsTheCallAndTheRulesStand() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of("America/Los_Angeles"));
        jdbc.update("INSERT INTO llm_usage (day, calls) VALUES (?, 1000)", today);

        validate(s);

        assertThat(ai.calls()).isZero();
        assertThat(issues(s, "ALL").path("validatedAt").asString()).isNotBlank();
    }

    @Test
    void anUnavailableLlmIsTriedAgainLater() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        ai.fail(AiException.Kind.UNAVAILABLE).answer(answer(lineOfTheCertificate()));

        validate(s);
        assertThat(ai.calls()).isEqualTo(1);
        assertThat(withCode(issues(s, "OPEN"), "AI-01")).isNull();

        clock.advance(Duration.ofMinutes(1));
        drain();

        assertThat(ai.calls()).isEqualTo(2);
        assertThat(withCode(issues(s, "OPEN"), "AI-01")).isNotNull();
    }

    @Test
    void aRefusingLlmLeavesTheBatchWithItsRulesOnly() throws IOException {
        Setup s = batch(demo());
        confirmedGots(s);
        ai.fail(AiException.Kind.REJECTED);

        validate(s);

        assertThat(ai.calls()).isEqualTo(1);
        assertThat(issues(s, "ALL").path("issues").valueStream().filter(i -> "AI".equals(i.path("source").asString())))
                .isEmpty();
        // Nothing was answered, so the same data is tried again next time.
        assertThat(jdbc.queryForObject("SELECT ai_input_sha256 FROM batch WHERE id = ?::uuid", String.class, s.batchId()))
                .isNull();
    }
}
