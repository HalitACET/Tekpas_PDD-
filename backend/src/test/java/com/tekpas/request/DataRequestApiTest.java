package com.tekpas.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Data request links (PLAN M4, design v0.4): the panel side, the supplier's side and the review. */
@IntegrationTest
class DataRequestApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @Autowired
    ObjectMapper json;

    @AfterEach
    void resetClock() {
        clock.reset();
    }

    /** A batch with the default chain and a yarn supplier on the YARN step. */
    record Setup(Tenant tenant, String batchId, String gtin, String yarnStep, String fabricStep, String dyeingStep,
            String fiberStep, List<String> stepIds) {
    }

    Setup setup(Tenant tenant) {
        String gtin = TestGtins.gtin13();
        String productId = fixtures.body(fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", gtin, "name", "Organik tişört", "category", "T_SHIRT"))).path("id").asString();
        MvcTestResult created = fixtures.post(tenant, "/api/v1/batches", Map.of("productId", productId, "quantity", 2400));
        assertThat(created).hasStatus(201);
        String batchId = fixtures.body(created).path("id").asString();
        JsonNode chain = chain(tenant, batchId);
        String yarn = step(chain, "YARN");
        assertThat(fixtures.patch(tenant, "/api/v1/steps/" + yarn, Map.of("supplierId", supplier(tenant, "YARN"))))
                .hasStatusOk();
        List<String> ids = chain.path("steps").valueStream().map(s -> s.path("id").asString()).toList();
        return new Setup(tenant, batchId, gtin, yarn, step(chain, "FABRIC"), step(chain, "DYEING"),
                step(chain, "FIBER"), ids);
    }

    String supplier(Tenant tenant, String type) {
        return fixtures.body(fixtures.post(tenant, "/api/v1/suppliers", Map.of("name", type + " "
                + UUID.randomUUID().toString().substring(0, 4), "type", type, "city", "Bursa"))).path("id").asString();
    }

    JsonNode chain(Tenant tenant, String batchId) {
        return fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId + "/chain"));
    }

    static String step(JsonNode chain, String type) {
        return stepNode(chain, type).path("id").asString();
    }

    static JsonNode stepNode(JsonNode chain, String type) {
        return chain.path("steps").valueStream().filter(s -> s.path("stepType").asString().equals(type)).findFirst()
                .orElseThrow();
    }

    JsonNode link(Tenant tenant, String stepId) {
        MvcTestResult result = fixtures.post(tenant, "/api/v1/steps/" + stepId + "/requests", Map.of());
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    String token(Tenant tenant, String stepId) {
        return link(tenant, stepId).path("token").asString();
    }

    /** Each test client gets its own IP, behind one proxy (application-test.yml). */
    static String randomIp() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return "203.0." + r.nextInt(256) + "." + r.nextInt(1, 255);
    }

    MvcTestResult open(String token) {
        return open(token, randomIp());
    }

    MvcTestResult open(String token, String ip) {
        return fixtures.mvc().get().uri("/api/v1/public/request").header("X-Request-Token", token)
                .header("X-Forwarded-For", ip + ", 10.0.0.1").exchange();
    }

    MvcTestResult submit(String token, Object body) {
        return fixtures.mvc().post().uri("/api/v1/public/request/submit").header("X-Request-Token", token)
                .header("X-Forwarded-For", randomIp() + ", 10.0.0.1").contentType(MediaType.APPLICATION_JSON)
                .content(body instanceof String s ? s : json.writeValueAsString(body))
                .exchange();
    }

    static Map<String, Object> yarnForm() {
        return Map.of("data", Map.of("fiberComposition", List.of(Map.of("fiber", "COTTON", "percent", 80),
                Map.of("fiber", "POLYESTER", "percent", 20)), "originCountry", "TR", "yarnCount", "Ne 30/1"),
                "submitterName", " Ahmet Kaya ", "submitterRole", "Kalite sorumlusu");
    }

    void assertFieldError(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream()).anySatisfy(error -> {
            assertThat(error.path("field").asString()).isEqualTo(field);
            assertThat(error.path("code").asString()).isEqualTo(code);
        });
    }

    String batchStatus(String batchId) {
        return jdbc.queryForObject("SELECT status FROM batch WHERE id = ?::uuid", String.class, batchId);
    }

    @Nested
    class CreatingALink {

        @Test
        void theTokenComesOnceAndOnlyItsHashIsStored() {
            Setup s = setup(fixtures.tenant());

            JsonNode created = link(s.tenant(), s.yarnStep());

            String token = created.path("token").asString();
            assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]+");
            assertThat(created.path("code").asString()).matches("KP-R-[0-9A-F]{4}");
            assertThat(Instant.parse(created.path("expiresAt").asString()))
                    .isCloseTo(clock.instant().plus(Duration.ofDays(7)), within(5, ChronoUnit.SECONDS));
            String stored = jdbc.queryForObject("SELECT token_hash FROM data_request WHERE id = ?::uuid", String.class,
                    created.path("id").asString());
            assertThat(stored).isEqualTo(RequestTokens.hash(token)).isNotEqualTo(token);
            String row = jdbc.queryForObject("SELECT row_to_json(r)::text FROM data_request r WHERE id = ?::uuid",
                    String.class, created.path("id").asString());
            assertThat(row).doesNotContain(token);
            // The chain shows the link without its token.
            JsonNode summary = stepNode(chain(s.tenant(), s.batchId()), "YARN").path("request");
            assertThat(summary.path("status").asString()).isEqualTo("SENT");
            assertThat(summary.has("token")).isFalse();
        }

        @Test
        void theFirstLinkStartsCollectingData() {
            Setup s = setup(fixtures.tenant());
            assertThat(batchStatus(s.batchId())).isEqualTo("DRAFT");

            link(s.tenant(), s.yarnStep());

            assertThat(batchStatus(s.batchId())).isEqualTo("COLLECTING");
        }

        @Test
        void aNewLinkRevokesTheOpenOne() {
            Setup s = setup(fixtures.tenant());
            String first = token(s.tenant(), s.yarnStep());

            String second = token(s.tenant(), s.yarnStep());

            MvcTestResult old = open(first);
            assertThat(old).hasStatus(410);
            assertThat(fixtures.body(old).path("reason").asString()).isEqualTo("LINK_REVOKED");
            assertThat(fixtures.body(old).path("link").path("stepType").asString()).isEqualTo("YARN");
            assertThat(open(second)).hasStatusOk();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM data_request WHERE step_id = ?::uuid AND status IN "
                    + "('SENT', 'OPENED')", Integer.class, s.yarnStep())).isEqualTo(1);
        }

        @Test
        void aStepWithoutASupplierOrFiberGetsNoLink() {
            Setup s = setup(fixtures.tenant());

            for (String stepId : List.of(s.fabricStep(), s.fiberStep())) {
                MvcTestResult result = fixtures.post(s.tenant(), "/api/v1/steps/" + stepId + "/requests", Map.of());
                assertThat(result).hasStatus(409);
                assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("STEP_HAS_NO_SUPPLIER");
            }
        }

        @Test
        void anotherCompanysStepOrLinkIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            Setup s = setup(tenants.a());
            String requestId = link(tenants.a(), s.yarnStep()).path("id").asString();

            assertThat(fixtures.post(tenants.b(), "/api/v1/steps/" + s.yarnStep() + "/requests", Map.of())).hasStatus(404);
            assertThat(fixtures.post(tenants.b(), "/api/v1/requests/" + requestId + "/revoke", Map.of())).hasStatus(404);
            assertThat(fixtures.post(tenants.b(), "/api/v1/steps/" + s.yarnStep() + "/approve", Map.of())).hasStatus(404);
            assertThat(fixtures.post(tenants.b(), "/api/v1/steps/" + s.yarnStep() + "/reject",
                    Map.of("reason", "Lif oranı uyuşmuyor."))).hasStatus(404);
        }

        @Test
        void editorsSendLinksViewersDoNot() {
            Tenant owner = fixtures.tenant();
            Setup s = setup(owner);

            assertThat(fixtures.post(fixtures.member(owner, UserRole.VIEWER), "/api/v1/steps/" + s.yarnStep()
                    + "/requests", Map.of())).hasStatus(403);
            assertThat(fixtures.post(fixtures.member(owner, UserRole.EDITOR), "/api/v1/steps/" + s.yarnStep()
                    + "/requests", Map.of())).hasStatus(201);
        }

        @Test
        void aRevokedLinkIsClosedAndCannotBeRevokedTwice() {
            Setup s = setup(fixtures.tenant());
            JsonNode created = link(s.tenant(), s.yarnStep());
            String uri = "/api/v1/requests/" + created.path("id").asString() + "/revoke";

            assertThat(fixtures.post(s.tenant(), uri, Map.of())).hasStatus(204);

            assertThat(fixtures.body(open(created.path("token").asString())).path("reason").asString())
                    .isEqualTo("LINK_REVOKED");
            MvcTestResult again = fixtures.post(s.tenant(), uri, Map.of());
            assertThat(again).hasStatus(409);
            assertThat(fixtures.body(again).path("reason").asString()).isEqualTo("REQUEST_NOT_OPEN");
        }
    }

    @Nested
    class TheSuppliersSide {

        @Test
        void theHolderSeesOnlyTheirOwnStep() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());

            MvcTestResult result = open(token);

            assertThat(result).hasStatusOk();
            JsonNode view = fixtures.body(result);
            assertThat(view.properties().stream().map(Map.Entry::getKey)).containsExactlyInAnyOrder("code",
                    "manufacturerName", "requesterName", "productName", "batchNo", "stepType", "expiresAt", "data",
                    "rejection");
            assertThat(view.path("stepType").asString()).isEqualTo("YARN");
            assertThat(view.path("productName").asString()).isEqualTo("Organik tişört");
            assertThat(view.path("requesterName").asString()).isEqualTo(s.tenant().user().getFullName());
            String text = fixtures.responseText(result);
            // Nothing of the rest of the chain, nor the batch's GTIN, quantity or id.
            for (String id : s.stepIds()) {
                assertThat(text).doesNotContain(id);
            }
            assertThat(text).doesNotContain(s.batchId()).doesNotContain(s.gtin()).doesNotContain("2400");
            assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
            assertThat(result.getResponse().getHeader("X-Robots-Tag")).contains("noindex");
        }

        @Test
        void everyOpeningIsCountedAndTheFirstIsInTheHistory() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());

            open(token);
            open(token);
            open(token);

            JsonNode summary = stepNode(chain(s.tenant(), s.batchId()), "YARN").path("request");
            assertThat(summary.path("status").asString()).isEqualTo("OPENED");
            assertThat(summary.path("openCount").asInt()).isEqualTo(3);
            assertThat(jdbc.queryForList("SELECT kind FROM step_event WHERE step_id = ?::uuid ORDER BY created_at, kind",
                    String.class, s.yarnStep())).containsExactlyInAnyOrder("REQUEST_CREATED", "REQUEST_OPENED");
        }

        @Test
        void anUnknownMalformedOrMissingTokenIsAnInvalidLink() {
            for (String token : List.of(RequestTokens.generate(), "short", "")) {
                MvcTestResult result = open(token);
                assertThat(result).hasStatus(404);
                assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("LINK_INVALID");
                assertThat(fixtures.body(result).has("link")).isFalse();
            }
            assertThat(fixtures.mvc().get().uri("/api/v1/public/request")
                    .header("X-Forwarded-For", randomIp() + ", 10.0.0.1").exchange()).hasStatus(404);
        }

        @Test
        void aLinkExpiresAfterSevenDaysAndStaysExpired() {
            Setup s = setup(fixtures.tenant());
            JsonNode created = link(s.tenant(), s.yarnStep());
            clock.advance(Duration.ofDays(7));

            MvcTestResult result = open(created.path("token").asString());

            assertThat(result).hasStatus(410);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("LINK_EXPIRED");
            assertThat(fixtures.body(result).path("link").path("expiresAt").asString())
                    .isEqualTo(created.path("expiresAt").asString());
            assertThat(jdbc.queryForObject("SELECT status FROM data_request WHERE id = ?::uuid", String.class,
                    created.path("id").asString())).isEqualTo("EXPIRED");
        }

        @Test
        void aSubmissionNeedsTheStepTypesRequiredFieldsAndAName() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());

            MvcTestResult empty = submit(token, Map.of("data", Map.of(), "submitterName", "Ahmet Kaya"));
            assertFieldError(empty, "data.fiberComposition", "NotNull");
            assertFieldError(empty, "data.originCountry", "NotNull");
            assertFieldError(submit(token, Map.of("data", Map.of("fiberComposition",
                    List.of(Map.of("fiber", "COTTON", "percent", 100)), "originCountry", "TR"), "submitterName", " ")),
                    "submitterName", "NotBlank");
            assertFieldError(submit(token, Map.of("data", Map.of("fiberComposition",
                    List.of(Map.of("fiber", "COTTON", "percent", 100)), "originCountry", "TR", "gsm", 180),
                    "submitterName", "Ahmet Kaya")), "data.gsm", "NotApplicable");
            assertThat(stepNode(chain(s.tenant(), s.batchId()), "YARN").path("status").asString()).isEqualTo("PENDING");
        }

        @Test
        void aSubmissionSendsTheStepForReviewOnce() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());

            MvcTestResult result = submit(token, yarnForm());

            assertThat(result).hasStatusOk();
            String code = fixtures.body(result).path("code").asString();
            JsonNode yarn = stepNode(chain(s.tenant(), s.batchId()), "YARN");
            assertThat(yarn.path("status").asString()).isEqualTo("SUBMITTED");
            assertThat(yarn.path("data").path("yarnCount").asString()).isEqualTo("Ne 30/1");
            assertThat(yarn.path("submission").path("name").asString()).isEqualTo("Ahmet Kaya");
            assertThat(yarn.path("submission").path("role").asString()).isEqualTo("Kalite sorumlusu");
            assertThat(yarn.path("submission").path("code").asString()).isEqualTo(code);
            assertThat(yarn.path("request").path("status").asString()).isEqualTo("COMPLETED");
            assertThat(jdbc.queryForObject("SELECT actor_name FROM step_event WHERE step_id = ?::uuid AND kind = "
                    + "'SUBMITTED'", String.class, s.yarnStep())).isEqualTo("Ahmet Kaya");

            MvcTestResult again = submit(token, yarnForm());
            assertThat(again).hasStatus(410);
            JsonNode problem = fixtures.body(again);
            assertThat(problem.path("reason").asString()).isEqualTo("ALREADY_SUBMITTED");
            assertThat(problem.path("link").path("submitterName").asString()).isEqualTo("Ahmet Kaya");
            assertThat(problem.path("link").path("code").asString()).isEqualTo(code);
            assertThat(fixtures.body(open(token)).path("reason").asString()).isEqualTo("ALREADY_SUBMITTED");
        }

        @Test
        void twoSubmissionsAtOnceLetOnlyOneThrough() throws Exception {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
                for (int i = 0; i < 2; i++) {
                    results.add(pool.submit(() -> {
                        start.await();
                        return submit(token, yarnForm()).getResponse().getStatus();
                    }));
                }
                start.countDown();
                List<Integer> statuses = new ArrayList<>();
                for (Future<Integer> f : results) {
                    statuses.add(f.get());
                }
                assertThat(statuses).containsExactlyInAnyOrder(200, 410);
            }
        }
    }

    @Nested
    class Review {

        Setup submitted() {
            Setup s = setup(fixtures.tenant());
            assertThat(submit(token(s.tenant(), s.yarnStep()), yarnForm())).hasStatusOk();
            return s;
        }

        @Test
        void approvingMakesTheStepGreenAndOnlySubmittedDataCanBeReviewed() {
            Setup s = submitted();

            MvcTestResult result = fixtures.post(s.tenant(), "/api/v1/steps/" + s.yarnStep() + "/approve", Map.of());

            assertThat(result).hasStatusOk();
            JsonNode yarn = stepNode(fixtures.body(result), "YARN");
            assertThat(yarn.path("status").asString()).isEqualTo("APPROVED");
            assertThat(yarn.path("approvedAt").isNull()).isFalse();
            MvcTestResult again = fixtures.post(s.tenant(), "/api/v1/steps/" + s.yarnStep() + "/approve", Map.of());
            assertThat(again).hasStatus(409);
            assertThat(fixtures.body(again).path("reason").asString()).isEqualTo("STEP_NOT_SUBMITTED");
        }

        @Test
        void onlyOwnersAndAdminsReview() {
            Setup s = submitted();

            assertThat(fixtures.post(fixtures.member(s.tenant(), UserRole.EDITOR), "/api/v1/steps/" + s.yarnStep()
                    + "/approve", Map.of())).hasStatus(403);
            assertThat(fixtures.post(fixtures.member(s.tenant(), UserRole.ADMIN), "/api/v1/steps/" + s.yarnStep()
                    + "/approve", Map.of())).hasStatusOk();
        }

        @Test
        void aRejectionNeedsAReasonAndOnlyTheStepTypesFields() {
            Setup s = submitted();
            String uri = "/api/v1/steps/" + s.yarnStep() + "/reject";

            assertFieldError(fixtures.post(s.tenant(), uri, Map.of("reason", " ")), "reason", "NotBlank");
            assertFieldError(fixtures.post(s.tenant(), uri, Map.of("reason", "Kontrol edin.", "fields",
                    List.of("fiberComposition", "waterLPerKg"))), "fields", "NotApplicable");
            assertFieldError(fixtures.post(s.tenant(), uri, Map.of("reason", "Kontrol edin.", "fields",
                    List.of("anything"))), "fields", "NotApplicable");
        }

        @Test
        void aRejectedStepGetsANewLinkThatShowsTheReasonAndThePreviousData() {
            Setup s = submitted();
            MvcTestResult rejected = fixtures.post(s.tenant(), "/api/v1/steps/" + s.yarnStep() + "/reject",
                    Map.of("reason", "Lif oranı uyuşmuyor.", "fields", List.of("fiberComposition")));
            assertThat(rejected).hasStatusOk();
            JsonNode yarn = stepNode(fixtures.body(rejected), "YARN");
            assertThat(yarn.path("status").asString()).isEqualTo("REJECTED");
            assertThat(yarn.path("rejection").path("reason").asString()).isEqualTo("Lif oranı uyuşmuyor.");

            String token = token(s.tenant(), s.yarnStep());
            JsonNode view = fixtures.body(open(token));

            assertThat(view.path("rejection").path("reason").asString()).isEqualTo("Lif oranı uyuşmuyor.");
            assertThat(view.path("rejection").path("fields").valueStream().map(JsonNode::asString))
                    .containsExactly("fiberComposition");
            assertThat(view.path("rejection").path("byName").asString()).isEqualTo(s.tenant().user().getFullName());
            assertThat(view.path("data").path("yarnCount").asString()).isEqualTo("Ne 30/1");

            assertThat(submit(token, yarnForm())).hasStatusOk();
            JsonNode resubmitted = stepNode(chain(s.tenant(), s.batchId()), "YARN");
            assertThat(resubmitted.path("status").asString()).isEqualTo("SUBMITTED");
            assertThat(resubmitted.path("rejection").isNull()).isTrue();
        }

        @Test
        void theBatchIsReadyOnceEveryStepIsApproved() {
            Setup s = submitted();
            jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE batch_id = ?::uuid AND id <> ?::uuid",
                    s.batchId(), s.yarnStep());

            fixtures.post(s.tenant(), "/api/v1/steps/" + s.yarnStep() + "/approve", Map.of());

            assertThat(batchStatus(s.batchId())).isEqualTo("READY");
        }
    }

    @Nested
    class RateLimits {

        @Test
        void tenUnknownTokensFromOneClientBlockItForAMinuteButNotOthers() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());
            String ip = randomIp();

            for (int i = 0; i < 10; i++) {
                assertThat(open(RequestTokens.generate(), ip)).hasStatus(404);
            }
            MvcTestResult blocked = open(token, ip);

            assertThat(blocked).hasStatus(429);
            assertThat(Integer.parseInt(blocked.getResponse().getHeader("Retry-After"))).isBetween(1, 60);
            assertThat(open(token, randomIp())).hasStatusOk();
            clock.advance(Duration.ofMinutes(1));
            assertThat(open(token, ip)).hasStatusOk();
        }

        @Test
        void addressesTheClientPutsInFrontDoNotChangeItsKey() {
            String ip = randomIp();
            for (int i = 0; i < 10; i++) {
                MvcTestResult result = fixtures.mvc().get().uri("/api/v1/public/request")
                        .header("X-Request-Token", RequestTokens.generate())
                        .header("X-Forwarded-For", randomIp() + ", " + ip + ", 10.0.0.1").exchange();
                assertThat(result).hasStatus(404);
            }
            assertThat(open(RequestTokens.generate(), ip)).hasStatus(429);
        }

        @Test
        void sixtyOpeningsAMinutePerLinkWhateverTheClient() {
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());
            for (int i = 0; i < 60; i++) {
                assertThat(open(token)).hasStatusOk();
            }
            assertThat(open(token)).hasStatus(429);
        }

        @Test
        void thirtyRequestsAMinutePerClient() {
            String ip = randomIp();
            Setup s = setup(fixtures.tenant());
            String token = token(s.tenant(), s.yarnStep());
            for (int i = 0; i < 30; i++) {
                assertThat(open(token, ip)).hasStatusOk();
            }
            assertThat(open(token, ip)).hasStatus(429);
        }
    }

    @Nested
    class DyeingData {

        MvcTestResult patchDyeing(Setup s, String json) {
            return fixtures.patch(s.tenant(), "/api/v1/steps/" + s.dyeingStep(), "{\"data\":" + json + "}");
        }

        @Test
        void theDesignsDyeingFieldsAreAccepted() {
            Setup s = setup(fixtures.tenant());

            MvcTestResult result = patchDyeing(s, """
                    {"dyeProcess":"REACTIVE","shade":"Ekru","chemicalStandards":["ZDHC_MRSL","OEKO_TEX_ECO_PASSPORT"],
                     "deliveredKg":1150,"waterLPerKg":62}""");

            assertThat(result).hasStatusOk();
            JsonNode data = stepNode(fixtures.body(result), "DYEING").path("data");
            assertThat(data.path("chemicalStandards").valueStream().map(JsonNode::asString))
                    .containsExactly("ZDHC_MRSL", "OEKO_TEX_ECO_PASSPORT");
            assertThat(data.path("deliveredKg").asInt()).isEqualTo(1150);
        }

        @Test
        void otherNeedsADescriptionAndNoneStandsAlone() {
            Setup s = setup(fixtures.tenant());

            assertFieldError(patchDyeing(s, "{\"dyeProcess\":\"OTHER\"}"), "data.dyeProcessOther", "NotBlank");
            assertThat(patchDyeing(s, "{\"dyeProcess\":\"OTHER\",\"dyeProcessOther\":\"Batik\"}")).hasStatusOk();
            assertFieldError(patchDyeing(s, "{\"dyeProcess\":\"REACTIVE\",\"dyeProcessOther\":\"Batik\"}"),
                    "data.dyeProcessOther", "NotApplicable");
            assertFieldError(patchDyeing(s, "{\"chemicalStandards\":[\"NONE\",\"BLUESIGN\"]}"),
                    "data.chemicalStandards", "NoneExclusive");
            assertFieldError(patchDyeing(s, "{\"chemicalStandards\":[\"BLUESIGN\",\"BLUESIGN\"]}"),
                    "data.chemicalStandards", "Duplicate");
            assertFieldError(patchDyeing(s, "{\"dyeProcess\":\"OTHER\",\"dyeProcessOther\":\"" + "x".repeat(81)
                    + "\"}"), "data.dyeProcessOther", "Size");
            assertThat(patchDyeing(s, "{\"chemicalStandards\":[\"NONE\"]}")).hasStatusOk();
        }

        @Test
        void dataWithTheOldKeysStillReads() {
            Setup s = setup(fixtures.tenant());
            jdbc.update("UPDATE supply_step SET data = CAST(? AS jsonb) WHERE id = ?::uuid",
                    "{\"process\":\"Reaktif boya\",\"chemicalCompliance\":\"ZDHC\",\"waterLPerKg\":62}", s.dyeingStep());

            JsonNode data = stepNode(chain(s.tenant(), s.batchId()), "DYEING").path("data");

            assertThat(data.path("waterLPerKg").asInt()).isEqualTo(62);
            assertThat(data.has("process")).isFalse();
            assertThat(data.has("chemicalCompliance")).isFalse();
        }
    }
}
