package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.ai.AiRequest;
import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.passport.PassportTestSupport.Setup;
import com.tekpas.support.FakeAiClient;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * Translations of a batch's free texts before publishing (M11 T1–T2, docs/m11-plan.md §3), with the LLM switched on
 * and a key set, so only the company decides whether the (fake) AI is asked. Only approved translations of the texts
 * as they are now reach the passport, frozen in schemaVersion 3.
 */
@IntegrationTest
@TestPropertySource(properties = {
        "tekpas.ai.llm.enabled=true",
        "tekpas.ai.llm.daily-limit=1000",
        "tekpas.ai.gemini.api-key=test-key-not-a-secret",
        "tekpas.ai.gemini.model=gemini-test-model"})
class PassportTranslationApiTest {

    /** T1 is the product description, T2 the fabric step's "Süprem"; the rest must be dropped. */
    private static final String ANSWER = """
            {"translations":[
              {"ref":"T1","language":"en","text":"Organic cotton polo"},
              {"ref":"T1","language":"de","text":"Polo aus Bio-Baumwolle"},
              {"ref":"T2","language":"en","text":"Single jersey"},
              {"ref":"T2","language":"de","text":"<b>Single-Jersey</b>"},
              {"ref":"T1","language":"en","text":"A second answer for the same text"},
              {"ref":"T1","language":"fr","text":"Polo en coton bio"},
              {"ref":"T9","language":"en","text":"Not asked for"}]}""";

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

    PassportTestSupport t;

    @BeforeEach
    void init() {
        ai.reset();
        storage.reset();
        jdbc.update("DELETE FROM llm_usage");
        drain();
        t = new PassportTestSupport(fixtures, jdbc, worker);
    }

    @AfterEach
    void cleanUp() {
        ai.reset();
        storage.reset();
    }

    private void drain() {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
    }

    private List<AiRequest> translationRequests() {
        return ai.requests().stream().filter(r -> r.instruction().startsWith("You translate")).toList();
    }

    private Tenant demo() {
        Tenant tenant = fixtures.tenant();
        jdbc.update("UPDATE company SET is_demo = TRUE WHERE id = ?", tenant.company().getId());
        return tenant;
    }

    private static String uri(Setup s) {
        return "/api/v1/batches/" + s.batchId() + "/translations";
    }

    private JsonNode get(Setup s) {
        MvcTestResult result = fixtures.get(s.owner(), uri(s));
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    private static JsonNode field(JsonNode translations, String field) {
        return translations.path("fields").valueStream().filter(f -> f.path("field").asString().equals(field))
                .findFirst().orElseThrow();
    }

    private static JsonNode entry(JsonNode field, String language) {
        return field.path("translations").valueStream().filter(e -> e.path("language").asString().equals(language))
                .findFirst().orElseThrow();
    }

    private String fabricField(Setup s) {
        return "step." + s.steps().get("FABRIC") + ".fabricType";
    }

    private JsonNode suggested(Setup s) {
        ai.answer(ANSWER);
        MvcTestResult result = fixtures.post(s.owner(), uri(s) + "/suggest", Map.of());
        assertThat(result).hasStatus(202);
        assertThat(fixtures.body(result).path("suggesting").asBoolean()).isTrue();
        drain();
        return get(s);
    }

    private JsonNode publishedSnapshot(Setup s) {
        MvcTestResult published = fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/passports", Map.of());
        assertThat(published).hasStatus(201);
        String id = fixtures.body(published).path("id").asString();
        return fixtures.body(fixtures.get(s.owner(), "/api/v1/passports/" + id)).path("snapshot");
    }

    @Test
    void listsThePassportsFreeTextsInTheirLanguageWithEmptyTranslations() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        fixtures.patch(s.owner(), "/api/v1/products/" + s.productId(), Map.of("careInfo",
                Map.of("note", "Wash inside out", "noteLanguage", "en")));

        JsonNode body = get(s);

        assertThat(body.path("aiAvailable").asBoolean()).isFalse();
        assertThat(body.path("suggesting").asBoolean()).isFalse();
        assertThat(body.path("fields").valueStream().map(f -> f.path("kind").asString() + ":" + f.path("source").asString()
                + ":" + f.path("sourceLanguage").asString())).containsExactly(
                "PRODUCT_DESCRIPTION:Organik pamuklu polo:tr", "CARE_NOTE:Wash inside out:en", "FABRIC_TYPE:Süprem:tr");
        // The other two languages of each text, nothing in them yet; the product name is not here.
        assertThat(field(body, "product.care.note").path("translations").valueStream()
                .map(e -> e.path("language").asString())).containsExactly("tr", "de");
        assertThat(entry(field(body, fabricField(s)), "en").path("text").isNull()).isTrue();
        assertThat(field(body, fabricField(s)).path("stepType").asString()).isEqualTo("FABRIC");
        assertThat(fixtures.responseText(fixtures.get(s.owner(), uri(s)))).doesNotContain("Organik Pamuk Polo");
    }

    @Test
    void aDemoCompanyGetsUnapprovedSuggestionsOnlyForWhatWasAsked() throws IOException {
        Setup s = t.publishable(demo());

        JsonNode body = suggested(s);

        assertThat(body.path("aiAvailable").asBoolean()).isTrue();
        assertThat(body.path("suggesting").asBoolean()).isFalse();
        JsonNode description = field(body, "product.description");
        assertThat(entry(description, "en").path("text").asString()).isEqualTo("Organic cotton polo");
        assertThat(entry(description, "en").path("aiSuggested").asBoolean()).isTrue();
        assertThat(entry(description, "en").path("approved").asBoolean()).isFalse();
        assertThat(entry(description, "de").path("text").asString()).isEqualTo("Polo aus Bio-Baumwolle");
        assertThat(entry(field(body, fabricField(s)), "en").path("text").asString()).isEqualTo("Single jersey");
        // Markup, a second answer, an unasked language and an unknown reference are dropped.
        assertThat(entry(field(body, fabricField(s)), "de").path("text").isNull()).isTrue();
        // One translation call (the demo company's batch also gets its AI consistency checks).
        List<AiRequest> translations = translationRequests();
        assertThat(translations).hasSize(1);
        AiRequest request = translations.getFirst();
        String data = ((AiRequest.Text) request.document().getFirst()).text();
        assertThat(data).contains("T1 [tr -> en, de]: Organik pamuklu polo").contains("T2 [tr -> en, de]: Süprem")
                .startsWith("<<<DATA ");
        assertThat(request.instruction()).doesNotContain("Organik");
    }

    @Test
    void aRealCompanysTextsNeverReachTheAi() throws IOException {
        Setup s = t.publishable(fixtures.tenant());

        MvcTestResult result = fixtures.post(s.owner(), uri(s) + "/suggest", Map.of());

        assertThat(result).hasStatus(409);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("AI_NOT_AVAILABLE");
        drain();
        assertThat(translationRequests()).isEmpty();
    }

    @Test
    void onlyApprovedTranslationsAreFrozenIntoTheNextVersion() throws IOException {
        Setup s = t.publishable(demo());
        suggested(s);

        // The English AI text approved as it is, the German one rewritten, the fabric's left unapproved.
        JsonNode saved = fixtures.body(fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", "product.description", "language", "en", "text", "Organic cotton polo", "approved", true),
                Map.of("field", "product.description", "language", "de", "text", "Polo aus Biobaumwolle",
                        "approved", true)))));
        assertThat(entry(field(saved, "product.description"), "de").path("aiSuggested").asBoolean()).isFalse();
        assertThat(entry(field(saved, "product.description"), "en").path("approvedByName").asString())
                .isEqualTo(s.owner().user().getFullName());

        JsonNode snapshot = publishedSnapshot(s);

        assertThat(snapshot.path("schemaVersion").asInt()).isEqualTo(3);
        assertThat(snapshot.path("translations").valueStream().map(tr -> tr.path("field").asString() + "/"
                + tr.path("language").asString() + ":" + tr.path("text").asString() + ":" + tr.path("aiAssisted").asBoolean()))
                .containsExactly("product.description/de:Polo aus Biobaumwolle:false",
                        "product.description/en:Organic cotton polo:true");
    }

    @Test
    void aStepsTextIsKeyedLikeTheSnapshotAndAChangedSourceNeedsANewApproval() throws IOException {
        Setup s = t.publishable(demo());
        fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", fabricField(s), "language", "en", "text", "Single jersey", "approved", true),
                Map.of("field", "product.description", "language", "en", "text", "Organic cotton polo",
                        "approved", true))));
        fixtures.patch(s.owner(), "/api/v1/products/" + s.productId(), Map.of("description", "Organik pamuk polo, ekru"));

        JsonNode stale = entry(field(get(s), "product.description"), "en");
        assertThat(stale.path("stale").asBoolean()).isTrue();
        assertThat(stale.path("approved").asBoolean()).isFalse();
        JsonNode snapshot = publishedSnapshot(s);

        // FABRIC is the third step of the chain; no database id leaves.
        assertThat(snapshot.path("translations").valueStream().map(tr -> tr.path("field").asString()))
                .containsExactly("s3.fabricType");
        assertThat(snapshot.path("supplyChain").get(2).path("key").asString()).isEqualTo("s3");
    }

    @Test
    void wrongFieldsLanguagesAndEmptyApprovalsAreFieldErrors() throws IOException {
        Setup s = t.publishable(fixtures.tenant());

        MvcTestResult result = fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", "product.name", "language", "en", "text", "Polo", "approved", true),
                Map.of("field", "product.description", "language", "tr", "text", "Polo", "approved", true),
                Map.of("field", "product.description", "language", "en", "text", " ", "approved", true),
                Map.of("field", "product.description", "language", "es", "text", "Polo", "approved", false))));

        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream().map(e -> e.path("field").asString() + ":"
                + e.path("code").asString())).contains("entries[3].language:Pattern");
        MvcTestResult business = fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", "product.name", "language", "en", "text", "Polo", "approved", true),
                Map.of("field", "product.description", "language", "tr", "text", "Polo", "approved", true),
                Map.of("field", "product.description", "language", "en", "text", " ", "approved", true))));
        assertThat(fixtures.body(business).path("errors").valueStream().map(e -> e.path("field").asString() + ":"
                + e.path("code").asString())).containsExactly("entries[0].field:TranslationField",
                "entries[1].language:TranslationLanguage", "entries[2].text:NotBlank");
        // A blank text without approval removes the translation.
        fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", "product.description", "language", "en", "text", "Polo", "approved", false))));
        assertThat(fixtures.put(s.owner(), uri(s), Map.of("entries", List.of(
                Map.of("field", "product.description", "language", "en", "text", "", "approved", false))))).hasStatusOk();
        assertThat(entry(field(get(s), "product.description"), "en").path("text").isNull()).isTrue();
    }

    @Test
    void anotherCompanysBatchIsNotFoundAndOnlyReviewersWrite() throws IOException {
        TenantPair tenants = fixtures.twoTenants();
        Setup theirs = t.publishable(tenants.b());
        String path = uri(theirs);

        assertThat(fixtures.get(tenants.a(), path)).hasStatus(404);
        assertThat(fixtures.post(tenants.a(), path + "/suggest", Map.of())).hasStatus(404);
        assertThat(fixtures.put(tenants.a(), path, Map.of("entries", List.of()))).hasStatus(404);
        Tenant viewer = fixtures.member(tenants.b(), UserRole.VIEWER);
        assertThat(fixtures.get(viewer, path)).hasStatusOk();
        assertThat(fixtures.put(viewer, path, Map.of("entries", List.of()))).hasStatus(403);
        assertThat(fixtures.post(viewer, path + "/suggest", Map.of())).hasStatus(403);
    }
}
