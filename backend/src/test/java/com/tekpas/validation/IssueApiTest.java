package com.tekpas.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * The consistency checks through the API (M7 T1, docs/m7-plan.md §4): the acceptance scenario, resolving and
 * reopening, the roles and the tenant rule on every endpoint.
 */
@IntegrationTest
class IssueApiTest {

    private static final String YARN_80_20 = """
            {"originCountry":"TR","fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":80},
             {"fiber":"POLYESTER","percent":20}],"yarnCount":"Ne 30/1","deliveredKg":900}""";
    private static final String YARN_95_5 = """
            {"originCountry":"TR","fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":95},
             {"fiber":"ELASTANE","percent":5}],"yarnCount":"Ne 30/1","deliveredKg":900}""";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    record Setup(Tenant owner, String batchId, String yarnStepId) {
    }

    /** The acceptance batch: label 95 % organic cotton + 5 % elastane, one yarn step. */
    private Setup batch(Tenant owner, boolean withLabel, boolean withDates) {
        Map<String, Object> product = new HashMap<>();
        product.put("gtin", TestGtins.gtin13());
        product.put("name", "Organik Pamuk Polo");
        product.put("category", "T_SHIRT");
        if (withLabel) {
            product.put("declaredFiberComposition", List.of(Map.of("fiber", "ORGANIC_COTTON", "percent", 95),
                    Map.of("fiber", "ELASTANE", "percent", 5)));
        }
        String productId = fixtures.body(fixtures.post(owner, "/api/v1/products", product)).path("id").asString();
        Map<String, Object> batch = new HashMap<>();
        batch.put("productId", productId);
        batch.put("quantity", 100);
        if (withDates) {
            batch.put("producedFrom", "2026-09-01");
            batch.put("producedTo", "2026-09-10");
        }
        String batchId = fixtures.body(fixtures.post(owner, "/api/v1/batches", batch)).path("id").asString();
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batchId + "/chain"));
        String yarn = null;
        for (JsonNode step : chain.path("steps")) {
            if ("YARN".equals(step.path("stepType").asString())) {
                yarn = step.path("id").asString();
            }
        }
        return new Setup(owner, batchId, yarn);
    }

    private void yarnData(Setup s, String status, String data) {
        jdbc.update("UPDATE supply_step SET status = ?, data = ?::jsonb WHERE id = ?::uuid", status, data,
                s.yarnStepId());
    }

    private JsonNode validate(Setup s) {
        MvcTestResult result = fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/validate", Map.of());
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    private JsonNode issues(Setup s, String status) {
        MvcTestResult result = fixtures.get(s.owner(), "/api/v1/batches/" + s.batchId() + "/issues?status=" + status);
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    private static JsonNode withCode(JsonNode list, String code) {
        for (JsonNode issue : list.path("issues")) {
            if (code.equals(issue.path("code").asString())) {
                return issue;
            }
        }
        return null;
    }

    @Test
    void aLabelThatDisagreesWithTheYarnIsABlockingIssueWithTheDataTheCardNeeds() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, true);
        yarnData(s, "APPROVED", YARN_80_20);

        JsonNode answer = validate(s);

        JsonNode lif = withCode(answer, "LIF-01");
        assertThat(lif).isNotNull();
        assertThat(lif.path("severity").asString()).isEqualTo("ERROR");
        assertThat(lif.path("source").asString()).isEqualTo("RULE");
        assertThat(lif.path("stepId").asString()).isEqualTo(s.yarnStepId());
        assertThat(lif.path("stepType").asString()).isEqualTo("YARN");
        assertThat(lif.path("resolved").asBoolean()).isFalse();
        assertThat(lif.path("params").path("label")).hasSize(2);
        assertThat(lif.path("params").path("declared")).hasSize(2);
        assertThat(lif.path("params").path("differing")).hasSize(3);
        assertThat(answer.path("open").path("errors").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(answer.path("validatedAt").asString()).isNotBlank();
        // The list shows the same as the run.
        assertThat(withCode(issues(s, "OPEN"), "LIF-01").path("id").asString()).isEqualTo(lif.path("id").asString());
    }

    @Test
    void correctingTheDataClosesTheErrorByItselfAndRunningAgainWritesNothingTwice() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, true);
        yarnData(s, "APPROVED", YARN_80_20);
        String id = withCode(validate(s), "LIF-01").path("id").asString();
        long rows = count(s);

        validate(s);
        assertThat(count(s)).isEqualTo(rows);

        yarnData(s, "APPROVED", YARN_95_5);
        JsonNode after = validate(s);

        assertThat(withCode(after, "LIF-01")).isNull();
        JsonNode closed = withCode(issues(s, "RESOLVED"), "LIF-01");
        assertThat(closed.path("id").asString()).isEqualTo(id);
        assertThat(closed.path("autoResolved").asBoolean()).isTrue();
        assertThat(closed.path("resolvedByName").isNull() || closed.path("resolvedByName").isMissingNode()).isTrue();
        assertThat(issues(s, "RESOLVED").path("resolved").asInt()).isGreaterThanOrEqualTo(1);

        // It goes wrong the same way again: the same issue opens again.
        yarnData(s, "APPROVED", YARN_80_20);
        JsonNode again = validate(s);
        assertThat(withCode(again, "LIF-01").path("id").asString()).isEqualTo(id);
        assertThat(withCode(again, "LIF-01").path("autoResolved").asBoolean()).isFalse();
    }

    private long count(Setup s) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM validation_issue WHERE batch_id = ?::uuid", Long.class,
                s.batchId());
        return n == null ? 0 : n;
    }

    @Test
    void aWarningCanBeResolvedWithANoteAndTakenBack() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false, true);
        JsonNode eks = withCode(validate(s), "EKS-01");
        assertThat(eks.path("severity").asString()).isEqualTo("WARNING");
        String id = eks.path("id").asString();

        MvcTestResult resolved = fixtures.post(owner, "/api/v1/issues/" + id + "/resolve",
                Map.of("note", "  Etiket henüz basılmadı  "));
        assertThat(resolved).hasStatusOk();
        JsonNode body = fixtures.body(resolved);
        assertThat(body.path("resolved").asBoolean()).isTrue();
        assertThat(body.path("autoResolved").asBoolean()).isFalse();
        assertThat(body.path("note").asString()).isEqualTo("Etiket henüz basılmadı");
        assertThat(body.path("resolvedByName").asString()).isEqualTo("Test User");
        assertThat(body.path("resolvedAt").asString()).isNotBlank();
        assertThat(withCode(issues(s, "OPEN"), "EKS-01")).isNull();

        // Still found by the next run, still resolved: nobody decides the same thing twice.
        assertThat(withCode(validate(s), "EKS-01")).isNull();
        assertThat(withCode(issues(s, "RESOLVED"), "EKS-01").path("id").asString()).isEqualTo(id);

        MvcTestResult twice = fixtures.post(owner, "/api/v1/issues/" + id + "/resolve", Map.of());
        assertThat(twice).hasStatus(409);
        assertThat(fixtures.body(twice).path("reason").asString()).isEqualTo("ALREADY_RESOLVED");

        MvcTestResult reopened = fixtures.post(owner, "/api/v1/issues/" + id + "/reopen", Map.of());
        assertThat(reopened).hasStatusOk();
        assertThat(fixtures.body(reopened).path("resolved").asBoolean()).isFalse();
        assertThat(withCode(issues(s, "OPEN"), "EKS-01")).isNotNull();

        MvcTestResult open = fixtures.post(owner, "/api/v1/issues/" + id + "/reopen", Map.of());
        assertThat(open).hasStatus(409);
        assertThat(fixtures.body(open).path("reason").asString()).isEqualTo("NOT_RESOLVED");
    }

    @Test
    void aWarningCanBeResolvedWithoutABody() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false, true);
        String id = withCode(validate(s), "EKS-01").path("id").asString();

        MvcTestResult resolved = fixtures.mvc().post().uri("/api/v1/issues/" + id + "/resolve")
                .header("Authorization", owner.bearer()).exchange();

        assertThat(resolved).hasStatusOk();
    }

    @Test
    void aNoteLongerThan500CharactersIsRefused() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false, true);
        String id = withCode(validate(s), "EKS-01").path("id").asString();

        MvcTestResult result = fixtures.post(owner, "/api/v1/issues/" + id + "/resolve", Map.of("note", "x".repeat(501)));

        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").toString()).contains("note");
    }

    @Test
    void aBlockingIssueCannotBeResolvedByHand() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, true);
        yarnData(s, "APPROVED", YARN_80_20);
        String id = withCode(validate(s), "LIF-01").path("id").asString();

        MvcTestResult result = fixtures.post(owner, "/api/v1/issues/" + id + "/resolve", Map.of("note", "geç"));

        assertThat(result).hasStatus(409);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("ISSUE_BLOCKING");
        assertThat(withCode(issues(s, "OPEN"), "LIF-01")).isNotNull();
    }

    @Test
    void anIssueThatClosedItselfIsNotReopenedByHand() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, true);
        yarnData(s, "APPROVED", YARN_80_20);
        String id = withCode(validate(s), "LIF-01").path("id").asString();
        yarnData(s, "APPROVED", YARN_95_5);
        validate(s);

        MvcTestResult result = fixtures.post(owner, "/api/v1/issues/" + id + "/reopen", Map.of());

        assertThat(result).hasStatus(409);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("AUTO_RESOLVED");
    }

    @Test
    void theListIsMostSevereFirstAndCountsBothSides() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, false);
        yarnData(s, "APPROVED", YARN_80_20);
        JsonNode answer = validate(s);

        List<String> severities = answer.path("issues").valueStream().map(i -> i.path("severity").asString()).toList();
        assertThat(severities).containsExactly("ERROR", "WARNING", "INFO");
        assertThat(answer.path("open").path("errors").asInt()).isEqualTo(1);
        assertThat(answer.path("open").path("infos").asInt()).isEqualTo(1);
        JsonNode all = issues(s, "ALL");
        assertThat(all.path("issues")).hasSize(answer.path("issues").size());
        assertThat(issues(s, "RESOLVED").path("issues")).isEmpty();
        assertThat(fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/issues?status=NOPE")).hasStatus(400);
    }

    @Test
    void aBatchNeverCheckedHasNoIssuesAndNoCheckTime() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, true);

        JsonNode list = issues(s, "ALL");

        assertThat(list.path("issues")).isEmpty();
        assertThat(list.path("validatedAt").isNull() || list.path("validatedAt").isMissingNode()).isTrue();
    }

    @Test
    void theRolesDecideWhoRunsWhoResolvesAndWhoOnlyReads() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false, true);
        String id = withCode(validate(s), "EKS-01").path("id").asString();
        Tenant admin = fixtures.member(owner, UserRole.ADMIN);
        Tenant editor = fixtures.member(owner, UserRole.EDITOR);
        Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
        Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
        String validatePath = "/api/v1/batches/" + s.batchId() + "/validate";
        String listPath = "/api/v1/batches/" + s.batchId() + "/issues";

        assertThat(fixtures.post(editor, validatePath, Map.of())).hasStatusOk();
        assertThat(fixtures.post(viewer, validatePath, Map.of())).hasStatus(403);
        assertThat(fixtures.post(supplier, validatePath, Map.of())).hasStatus(403);

        assertThat(fixtures.get(viewer, listPath)).hasStatusOk();
        assertThat(fixtures.get(editor, listPath)).hasStatusOk();
        assertThat(fixtures.get(supplier, listPath)).hasStatus(403);

        assertThat(fixtures.post(editor, "/api/v1/issues/" + id + "/resolve", Map.of())).hasStatus(403);
        assertThat(fixtures.post(viewer, "/api/v1/issues/" + id + "/resolve", Map.of())).hasStatus(403);
        assertThat(fixtures.post(supplier, "/api/v1/issues/" + id + "/resolve", Map.of())).hasStatus(403);
        assertThat(fixtures.post(admin, "/api/v1/issues/" + id + "/resolve", Map.of())).hasStatusOk();
        assertThat(fixtures.post(editor, "/api/v1/issues/" + id + "/reopen", Map.of())).hasStatus(403);
        assertThat(fixtures.post(admin, "/api/v1/issues/" + id + "/reopen", Map.of())).hasStatusOk();

        assertThat(fixtures.mvc().post().uri(validatePath).exchange()).hasStatus(401);
    }

    @Test
    void anotherCompanysBatchAndIssuesAreNotFoundOnEveryEndpoint() {
        TenantPair pair = fixtures.twoTenants();
        Setup mine = batch(pair.a(), false, true);
        String id = withCode(validate(mine), "EKS-01").path("id").asString();
        Tenant other = pair.b();

        assertThat(fixtures.post(other, "/api/v1/batches/" + mine.batchId() + "/validate", Map.of())).hasStatus(404);
        assertThat(fixtures.get(other, "/api/v1/batches/" + mine.batchId() + "/issues")).hasStatus(404);
        assertThat(fixtures.post(other, "/api/v1/issues/" + id + "/resolve", Map.of())).hasStatus(404);
        assertThat(fixtures.post(other, "/api/v1/issues/" + id + "/reopen", Map.of())).hasStatus(404);
        assertThat(fixtures.post(other, "/api/v1/issues/" + UUID.randomUUID() + "/resolve", Map.of())).hasStatus(404);
        // Nothing the other company did changed the issue.
        assertThat(withCode(issues(mine, "OPEN"), "EKS-01")).isNotNull();
        // And nothing was written for the other company's attempt.
        Long rows = jdbc.queryForObject("SELECT count(*) FROM validation_issue WHERE company_id = ?::uuid", Long.class,
                other.company().getId().toString());
        assertThat(rows).isZero();
    }

    @Test
    void everyIssueRowCarriesTheCompanyOfItsBatch() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, false);
        yarnData(s, "APPROVED", YARN_80_20);
        validate(s);

        Long wrong = jdbc.queryForObject("""
                SELECT count(*) FROM validation_issue v JOIN batch b ON b.id = v.batch_id
                WHERE v.batch_id = ?::uuid AND v.company_id <> b.company_id
                """, Long.class, s.batchId());

        assertThat(wrong).isZero();
        assertThat(count(s)).isPositive();
    }

    @Test
    void twoRunsAtTheSameTimeWriteEachFindingOnce() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, true, false);
        yarnData(s, "APPROVED", YARN_80_20);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> run = () -> fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/validate", Map.of())
                    .getResponse().getStatus();
            Future<Integer> a = pool.submit(run);
            Future<Integer> b = pool.submit(run);

            assertThat(a.get()).isEqualTo(200);
            assertThat(b.get()).isEqualTo(200);
        } finally {
            pool.shutdownNow();
        }

        Long distinct = jdbc.queryForObject(
                "SELECT count(DISTINCT fingerprint) FROM validation_issue WHERE batch_id = ?::uuid", Long.class,
                s.batchId());
        assertThat(count(s)).isEqualTo(distinct);
        assertThat(count(s)).isGreaterThanOrEqualTo(2);
    }

    @Test
    void theDatabaseRefusesTheSameFindingTwiceAndAnImpossibleResolution() {
        Tenant owner = fixtures.tenant();
        Setup s = batch(owner, false, true);
        validate(s);
        String insert = """
                INSERT INTO validation_issue (batch_id, company_id, source, severity, code, message, fingerprint)
                VALUES (?::uuid, ?::uuid, 'RULE', 'INFO', 'EKS-02', 'x', 'EKS-02:-:-:dup')
                """;
        jdbc.update(insert, s.batchId(), owner.company().getId().toString());

        assertThatThrownBy(() -> jdbc.update(insert, s.batchId(), owner.company().getId().toString()))
                .isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE validation_issue SET auto_resolved = true WHERE batch_id = ?::uuid", s.batchId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
