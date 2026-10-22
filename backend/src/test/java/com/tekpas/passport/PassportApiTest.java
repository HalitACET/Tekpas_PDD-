package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.passport.PassportTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * Publishing, versions, withdrawing and the preview (M6 T2, docs/m6-plan.md §3). The snapshot is checked against the
 * whitelist; a published version cannot be changed even by SQL.
 */
@IntegrationTest
class PassportApiTest {

    static final Pattern UUID_TEXT = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    @Autowired
    PassportRepository passports;

    @Autowired
    PassportService service;

    PassportTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new PassportTestSupport(fixtures, jdbc, worker);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private MvcTestResult publish(Tenant tenant, String batchId) {
        return fixtures.post(tenant, "/api/v1/batches/" + batchId + "/passports", Map.of());
    }

    private JsonNode published(Tenant tenant, String batchId) {
        MvcTestResult result = publish(tenant, batchId);
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    private JsonNode versions(Tenant tenant, String batchId) {
        return fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId + "/passports"));
    }

    private String batchStatus(Tenant tenant, String batchId) {
        return fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId)).path("status").asString();
    }

    private JsonNode detail(Tenant tenant, String passportId) {
        MvcTestResult result = fixtures.get(tenant, "/api/v1/passports/" + passportId);
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    @Test
    void publishingFreezesTheSnapshotAndMarksTheBatchPublished() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);

        JsonNode v = published(owner, s.batchId());

        assertThat(v.path("version").asInt()).isEqualTo(1);
        assertThat(v.path("status").asString()).isEqualTo("PUBLISHED");
        assertThat(v.path("completeness").asInt()).isEqualTo(93);
        assertThat(v.path("gtin").asString()).isEqualTo(s.gtin());
        assertThat(v.path("batchNo").asString()).isEqualTo(s.batchNo());
        assertThat(v.path("verificationCode").asString()).matches("[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}");
        assertThat(v.path("publishedByName").asString()).isNotBlank();
        assertThat(batchStatus(owner, s.batchId())).isEqualTo("PUBLISHED");

        JsonNode snap = detail(owner, v.path("id").asString()).path("snapshot");
        assertThat(snap.path("schemaVersion").asInt()).isEqualTo(2);
        assertThat(snap.path("passport").path("version").asInt()).isEqualTo(1);
        assertThat(snap.path("passport").path("gtin").asString()).isEqualTo(s.gtin());
        assertThat(snap.path("passport").path("batchNo").asString()).isEqualTo(s.batchNo());
        assertThat(snap.path("passport").path("publishedAt").asString()).isNotBlank();
        assertThat(snap.path("manufacturer").path("name").asString()).isEqualTo(owner.company().getName());
        assertThat(snap.path("product").path("name").asString()).isEqualTo("Organik Pamuk Polo");
        assertThat(snap.path("product").path("category").asString()).isEqualTo("T_SHIRT");
        assertThat(snap.path("product").path("fiberComposition").get(0).path("fiber").asString())
                .isEqualTo("ORGANIC_COTTON");
        assertThat(snap.path("batch").path("producedFrom").asString()).isEqualTo("2026-09-01");
        // The product has no care instructions: the page shows no care section.
        assertThat(snap.path("product").path("care").isNull()).isTrue();

        JsonNode chain = snap.path("supplyChain");
        assertThat(chain.valueStream().map(x -> x.path("type").asString())).containsExactly("FIBER", "YARN", "FABRIC",
                "DYEING", "SEWING");
        assertThat(chain.valueStream().map(x -> x.path("key").asString())).containsExactly("s1", "s2", "s3", "s4", "s5");
        assertThat(chain.valueStream().allMatch(x -> x.path("approved").asBoolean())).isTrue();
        // The default chain: each step takes the previous one's output.
        assertThat(chain.get(0).path("inputs")).isEmpty();
        assertThat(chain.get(1).path("inputs").get(0).asString()).isEqualTo("s1");
        assertThat(chain.get(4).path("inputs").get(0).asString()).isEqualTo("s4");
        assertThat(chain.get(1).path("actor").path("city").asString()).isEqualTo("Denizli");
        assertThat(chain.get(0).path("actor").isMissingNode()).isTrue();
        assertThat(chain.get(0).path("data").path("originRegion").asString()).isEqualTo("Şanlıurfa");
        assertThat(chain.get(2).path("data").path("fabricType").asString()).isEqualTo("Süprem");
        assertThat(chain.get(3).path("data").path("dyeProcess").asString()).isEqualTo("REACTIVE");

        JsonNode certs = snap.path("certificates");
        assertThat(certs.valueStream().map(c -> c.path("type").asString())).containsExactly("GOTS", "OEKO_TEX");
        assertThat(certs.get(0).path("key").asString()).isEqualTo("c1");
        assertThat(certs.get(0).path("validUntil").asString()).isEqualTo("2099-03-13");
        assertThat(chain.get(1).path("certificates").get(0).asString()).isEqualTo("c1");
        assertThat(chain.get(2).path("certificates").get(0).asString()).isEqualTo("c2");
    }

    @Test
    void theSnapshotHoldsOnlyTheWhitelistedFields() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v = published(owner, s.batchId());

        String text = fixtures.mvc().get().uri("/api/v1/passports/" + v.path("id").asString())
                .header("Authorization", owner.bearer()).exchange().getResponse().getContentAsString();
        String snapshot = fixtures.body(fixtures.get(owner, "/api/v1/passports/" + v.path("id").asString()))
                .path("snapshot").toString();

        assertThat(text).isNotBlank();
        // No quantities, no harvest year, no shade, no production order, no phone, no scores.
        assertThat(snapshot).doesNotContain("quantity", "deliveredKg", "harvestYear", "shade", "productionOrder",
                "phone", "905321234567", "completeness", "score", "UE-2026-1142", "2400", "Ekru");
        // And no database id anywhere (steps and certificates have opaque keys).
        assertThat(UUID_TEXT.matcher(snapshot).find()).as("a UUID in the snapshot").isFalse();
        // The whole snapshot is exactly one level of known records: top-level keys.
        JsonNode snap = fixtures.body(fixtures.get(owner, "/api/v1/passports/" + v.path("id").asString()))
                .path("snapshot");
        assertThat(snap.propertyNames()).containsExactlyInAnyOrder("schemaVersion", "passport", "manufacturer",
                "product", "batch", "supplyChain", "certificates");
    }

    /** M10 T8: the care instructions as they were when the version was published (design v1.0 121a). */
    @Test
    void theCareInstructionsAreFrozenWithTheVersion() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        String product = "/api/v1/products/" + s.productId();
        assertThat(fixtures.patch(owner, product, java.util.Map.of("careInfo", java.util.Map.of(
                "washing", java.util.Map.of("symbol", "WASH_40", "gentleness", "GENTLE"),
                "ironing", java.util.Map.of("symbol", "IRON_MEDIUM"),
                "note", "Ters çevirerek yıkayın.")))).hasStatusOk();

        JsonNode v = published(owner, s.batchId());
        assertThat(fixtures.patch(owner, product, "{\"careInfo\":null}")).hasStatusOk();

        JsonNode care = fixtures.body(fixtures.get(owner, "/api/v1/passports/" + v.path("id").asString()))
                .path("snapshot").path("product").path("care");
        assertThat(care.path("washing").path("symbol").asString()).isEqualTo("WASH_40");
        assertThat(care.path("washing").path("gentleness").asString()).isEqualTo("GENTLE");
        assertThat(care.path("ironing").path("symbol").asString()).isEqualTo("IRON_MEDIUM");
        assertThat(care.path("bleaching").isNull()).isTrue();
        assertThat(care.path("note").asString()).isEqualTo("Ters çevirerek yıkayın.");
        assertThat(care.path("noteLanguage").asString()).isEqualTo("tr");
        JsonNode open = fixtures.body(fixtures.mvc().get()
                .uri("/api/v1/public/passports/01/" + s.gtin() + "/10/" + s.batchNo()).exchange());
        assertThat(open.path("snapshot").path("product").path("care").path("washing").path("symbol").asString())
                .isEqualTo("WASH_40");
    }

    @Test
    void theStoredHashMatchesTheContentReadBack() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v = published(owner, s.batchId());

        Passport stored = passports.findById(UUID.fromString(v.path("id").asString())).orElseThrow();

        assertThat(stored.getSnapshotSha256()).hasSize(64).isEqualTo(service.sha256(stored.getSnapshot()));
        assertThat(VerificationCode.of(stored.getSnapshotSha256())).isEqualTo(v.path("verificationCode").asString());
    }

    @Test
    void aBatchThatIsNotReadyIsRefusedWithItsBlockersAndNothingIsSaved() {
        Tenant owner = fixtures.tenant();
        Setup s = t.prepare(owner);

        MvcTestResult result = publish(owner, s.batchId());

        assertThat(result).hasStatus(409);
        JsonNode body = fixtures.body(result);
        assertThat(body.path("reason").asString()).isEqualTo("PUBLISH_BLOCKED");
        assertThat(body.path("blockers").valueStream().map(b -> b.path("code").asString()))
                .contains("STEP_NOT_APPROVED", "SCORE_BELOW_THRESHOLD");
        assertThat(versions(owner, s.batchId())).isEmpty();
        assertThat(batchStatus(owner, s.batchId())).isNotEqualTo("PUBLISHED");
    }

    @Test
    void aPublishedBatchCannotBePublishedAgainWithoutANewVersionDraft() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        published(owner, s.batchId());

        MvcTestResult again = publish(owner, s.batchId());

        assertThat(again).hasStatus(409);
        assertThat(fixtures.body(again).path("reason").asString()).isEqualTo("ALREADY_PUBLISHED");
        assertThat(versions(owner, s.batchId())).hasSize(1);
    }

    @Test
    void aNewVersionKeepsTheOldOneLiveUntilItIsPublishedThenSupersedesIt() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v1 = published(owner, s.batchId());

        MvcTestResult draft = fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());
        assertThat(draft).hasStatusOk();
        // Editable again (every step is approved, so READY); the published version stays published.
        assertThat(fixtures.body(draft).path("status").asString()).isEqualTo("READY");
        JsonNode during = versions(owner, s.batchId());
        assertThat(during).hasSize(1);
        assertThat(during.get(0).path("status").asString()).isEqualTo("PUBLISHED");

        JsonNode v2 = published(owner, s.batchId());

        assertThat(v2.path("version").asInt()).isEqualTo(2);
        JsonNode after = versions(owner, s.batchId());
        assertThat(after.valueStream().map(x -> x.path("version").asInt())).containsExactly(2, 1);
        assertThat(after.get(0).path("status").asString()).isEqualTo("PUBLISHED");
        assertThat(after.get(1).path("status").asString()).isEqualTo("SUPERSEDED");
        assertThat(after.get(1).path("supersededAt").asString()).isNotBlank();
        // The old version is still readable in the panel, with its own content.
        assertThat(detail(owner, v1.path("id").asString()).path("snapshot").path("passport").path("version").asInt())
                .isEqualTo(1);
        assertThat(batchStatus(owner, s.batchId())).isEqualTo("PUBLISHED");
    }

    @Test
    void aDraftNeedsAPublishedBatch() {
        Tenant owner = fixtures.tenant();
        Setup s = t.prepare(owner);

        MvcTestResult result = fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());

        assertThat(result).hasStatus(409);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("BATCH_NOT_PUBLISHED");
    }

    @Test
    void withdrawingNeedsAReasonFreesTheBatchAndTheNextVersionContinuesTheNumbering() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v1 = published(owner, s.batchId());
        String path = "/api/v1/passports/" + v1.path("id").asString() + "/withdraw";

        assertThat(fixtures.post(owner, path, Map.of())).hasStatus(400);
        assertThat(fixtures.post(owner, path, Map.of("reason", "  "))).hasStatus(400);
        MvcTestResult withdrawn = fixtures.post(owner, path, Map.of("reason", "Etiket hatası"));

        assertThat(withdrawn).hasStatusOk();
        JsonNode w = fixtures.body(withdrawn);
        assertThat(w.path("status").asString()).isEqualTo("WITHDRAWN");
        assertThat(w.path("withdrawReason").asString()).isEqualTo("Etiket hatası");
        assertThat(w.path("withdrawnByName").asString()).isNotBlank();
        assertThat(w.path("withdrawnAt").asString()).isNotBlank();
        assertThat(batchStatus(owner, s.batchId())).isEqualTo("READY");
        // Only the published version can be withdrawn.
        MvcTestResult twice = fixtures.post(owner, path, Map.of("reason", "tekrar"));
        assertThat(twice).hasStatus(409);
        assertThat(fixtures.body(twice).path("reason").asString()).isEqualTo("NOT_PUBLISHED");

        JsonNode v2 = published(owner, s.batchId());
        assertThat(v2.path("version").asInt()).isEqualTo(2);
        assertThat(versions(owner, s.batchId()).valueStream().map(x -> x.path("status").asString()))
                .containsExactly("PUBLISHED", "WITHDRAWN");
    }

    @Test
    void thePreviewShowsWhatIsMissingAndSavesNothing() {
        Tenant owner = fixtures.tenant();
        Setup s = t.prepare(owner);
        jdbc.update("UPDATE supply_step SET status = 'APPROVED', approved_at = now(), data = ?::jsonb WHERE id = ?::uuid",
                PassportTestSupport.DATA.get("YARN"), s.steps().get("YARN"));

        MvcTestResult result = fixtures.get(owner, "/api/v1/batches/" + s.batchId() + "/passport-preview");

        assertThat(result).hasStatusOk();
        JsonNode snap = fixtures.body(result);
        assertThat(snap.path("passport").path("version").asInt()).isEqualTo(1);
        assertThat(snap.path("passport").path("publishedAt").isMissingNode()
                || snap.path("passport").path("publishedAt").isNull()).isTrue();
        JsonNode yarn = snap.path("supplyChain").get(1);
        assertThat(yarn.path("approved").asBoolean()).isTrue();
        assertThat(yarn.path("data").path("yarnCount").asString()).isEqualTo("Ne 30/1");
        JsonNode fabric = snap.path("supplyChain").get(2);
        assertThat(fabric.path("approved").asBoolean()).isFalse();
        assertThat(fabric.path("data").isMissingNode()).isTrue();
        assertThat(fabric.path("certificates")).isEmpty();
        assertThat(versions(owner, s.batchId())).isEmpty();
    }

    @Test
    void anUnconfirmedOrExpiredCertificateIsNotInThePassport() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        // A confirmed but expired GRS next to the valid GOTS on the yarn step, and an unconfirmed upload on the fabric.
        t.confirm(s, "YARN", "grs-scope-certificate.pdf", "GRS", "2020-06-30");
        fixtures.mvc().post().uri("/api/v1/steps/" + s.steps().get("FABRIC") + "/documents").multipart()
                .file(new org.springframework.mock.web.MockMultipartFile("file", "technical-sheet.pdf",
                        "application/pdf", getClass().getResourceAsStream("/documents/technical-sheet.pdf")
                                .readAllBytes()))
                .header("Authorization", owner.bearer()).exchange();

        // The expired GRS has no valid certificate of its own type: it blocks.
        MvcTestResult blocked = publish(owner, s.batchId());
        assertThat(blocked).hasStatus(409);
        assertThat(fixtures.body(blocked).path("blockers").valueStream().map(b -> b.path("code").asString()))
                .contains("CERTIFICATE_EXPIRED");

        // Replace it with a valid renewal of the same type: now it publishes, and only the valid ones are in.
        // (another file: the same file twice on one step is a duplicate)
        t.confirm(s, "YARN", "gots-turkce.pdf", "GRS", "2099-12-31");
        JsonNode v = published(owner, s.batchId());
        JsonNode certs = detail(owner, v.path("id").asString()).path("snapshot").path("certificates");
        assertThat(certs.valueStream().map(c -> c.path("type").asString())).containsExactlyInAnyOrder("GOTS", "GRS",
                "OEKO_TEX");
        assertThat(certs.valueStream().map(c -> c.path("validUntil").asString())).doesNotContain("2020-06-30");
    }

    @Test
    void aPublishedVersionCannotBeChangedOrDeletedEvenBySql() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v = published(owner, s.batchId());
        String id = v.path("id").asString();

        assertThatThrownBy(() -> jdbc.update("UPDATE passport SET snapshot = '{}'::jsonb WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("cannot change");
        assertThatThrownBy(() -> jdbc.update("UPDATE passport SET completeness = 100 WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE passport SET version = 7 WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE passport SET status = 'DRAFT' WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM passport WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("cannot be deleted");

        // A superseded version is frozen completely: it cannot go back to PUBLISHED.
        fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());
        published(owner, s.batchId());
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE passport SET status = 'PUBLISHED', superseded_at = NULL WHERE id = ?::uuid", id))
                .isInstanceOf(DataAccessException.class);
        assertThat(passports.findById(UUID.fromString(id)).orElseThrow().getSnapshot().passport().version())
                .isEqualTo(1);
    }

    @Test
    void twoPublishRequestsAtOnceMakeOneVersion() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        Callable<Integer> one = () -> publish(owner, s.batchId()).getResponse().getStatus();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> futures = pool.invokeAll(List.of(one, one));
            List<Integer> statuses = List.of(futures.get(0).get(), futures.get(1).get());
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        } finally {
            pool.shutdownNow();
        }
        assertThat(versions(owner, s.batchId())).hasSize(1);
    }

    @Test
    void publishingAndWithdrawingQueueTheWebCacheRefreshAndOpeningADraftDoesNot() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.prepare(owner);
        fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports", Map.of());
        // A refused publishing queues nothing (and its transaction would take the job with it).
        assertThat(refreshJobs(s)).isZero();

        t.approveAll(s);
        t.confirm(s, "YARN", "gots-scope-certificate.pdf", "GOTS", "2099-03-13");
        t.confirm(s, "FABRIC", "oekotex-standard100.pdf", "OEKO_TEX", "2099-01-01");
        String id = published(owner, s.batchId()).path("id").asString();
        assertThat(refreshJobs(s)).isEqualTo(1);
        String payload = jdbc.queryForObject("SELECT payload::text FROM job WHERE type = 'PASSPORT_CACHE_REFRESH' "
                + "AND payload->>'gtin' = ?", String.class, s.gtin());
        assertThat(payload).contains(s.gtin()).contains(s.batchNo());

        fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());
        assertThat(refreshJobs(s)).isEqualTo(1);

        fixtures.post(owner, "/api/v1/passports/" + id + "/withdraw", Map.of("reason", "x"));
        assertThat(refreshJobs(s)).isEqualTo(2);

        // No secret in the test configuration: the job ends at once and succeeds.
        while (worker.runPending() > 0) {
            // every due job
        }
        assertThat(jdbc.queryForList("SELECT DISTINCT status FROM job WHERE type = 'PASSPORT_CACHE_REFRESH' "
                + "AND payload->>'gtin' = ?", String.class, s.gtin())).containsExactly("DONE");
    }

    private int refreshJobs(Setup s) {
        return jdbc.queryForObject("SELECT count(*) FROM job WHERE type = 'PASSPORT_CACHE_REFRESH' "
                + "AND payload->>'gtin' = ?", Integer.class, s.gtin());
    }

    @Test
    void theBatchListAndDetailCarryTheNewestVersionWithItsScoreAtPublishing() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        assertThat(batchJson(owner, s).path("passport").isMissingNode() || batchJson(owner, s).path("passport").isNull()).isTrue();

        String v1 = published(owner, s.batchId()).path("id").asString();
        JsonNode first = batchJson(owner, s).path("passport");
        assertThat(first.path("version").asInt()).isEqualTo(1);
        assertThat(first.path("score").asInt()).isEqualTo(93);
        assertThat(first.path("withdrawn").asBoolean()).isFalse();
        // The list says the same.
        JsonNode row = fixtures.body(fixtures.get(owner, "/api/v1/batches?size=100")).path("content").valueStream()
                .filter(b -> b.path("id").asString().equals(s.batchId())).findFirst().orElseThrow();
        assertThat(row.path("passport").path("version").asInt()).isEqualTo(1);

        // A change after publishing does not move the published score; a draft is "published and not PUBLISHED".
        fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());
        JsonNode draft = batchJson(owner, s);
        assertThat(draft.path("status").asString()).isEqualTo("READY");
        assertThat(draft.path("passport").path("version").asInt()).isEqualTo(1);
        assertThat(draft.path("passport").path("score").asInt()).isEqualTo(93);

        fixtures.post(owner, "/api/v1/passports/" + v1 + "/withdraw", Map.of("reason", "x"));
        assertThat(batchJson(owner, s).path("passport").path("withdrawn").asBoolean()).isTrue();
        published(owner, s.batchId());
        JsonNode second = batchJson(owner, s).path("passport");
        assertThat(second.path("version").asInt()).isEqualTo(2);
        assertThat(second.path("withdrawn").asBoolean()).isFalse();
    }

    private JsonNode batchJson(Tenant owner, Setup s) {
        return fixtures.body(fixtures.get(owner, "/api/v1/batches/" + s.batchId()));
    }

    @Test
    void publishAndWithdrawAreWrittenToTheAuditTrail() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        JsonNode v = published(owner, s.batchId());
        fixtures.post(owner, "/api/v1/passports/" + v.path("id").asString() + "/withdraw", Map.of("reason", "x"));

        List<String> actions = jdbc.queryForList("""
                SELECT action FROM audit_log WHERE entity_id = ?::uuid AND company_id = ?::uuid ORDER BY id
                """, String.class, v.path("id").asString(), owner.company().getId().toString());

        assertThat(actions).containsExactly("PUBLISH", "WITHDRAW");
    }

    @Test
    void onlyOwnerAndAdminPublishAndWithdrawViewersAndEditorsRead() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.publishable(owner);
        Tenant editor = fixtures.member(owner, UserRole.EDITOR);
        Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
        Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
        Tenant admin = fixtures.member(owner, UserRole.ADMIN);

        assertThat(publish(editor, s.batchId())).hasStatus(403);
        assertThat(publish(viewer, s.batchId())).hasStatus(403);
        assertThat(publish(supplier, s.batchId())).hasStatus(403);
        JsonNode v = published(admin, s.batchId());
        String id = v.path("id").asString();

        for (Tenant reader : List.of(owner, editor, viewer)) {
            assertThat(fixtures.get(reader, "/api/v1/batches/" + s.batchId() + "/passports")).hasStatusOk();
            assertThat(fixtures.get(reader, "/api/v1/batches/" + s.batchId() + "/passport-preview")).hasStatusOk();
            assertThat(fixtures.get(reader, "/api/v1/passports/" + id)).hasStatusOk();
        }
        assertThat(fixtures.get(supplier, "/api/v1/batches/" + s.batchId() + "/passports")).hasStatus(403);
        assertThat(fixtures.get(supplier, "/api/v1/passports/" + id)).hasStatus(403);
        for (Tenant other : List.of(editor, viewer, supplier)) {
            assertThat(fixtures.post(other, "/api/v1/passports/" + id + "/withdraw", Map.of("reason", "x")))
                    .hasStatus(403);
            assertThat(fixtures.post(other, "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of()))
                    .hasStatus(403);
        }
        assertThat(fixtures.mvc().post().uri("/api/v1/batches/" + s.batchId() + "/passports").exchange())
                .hasStatus(401);
    }

    @Test
    void anotherCompanysBatchAndPassportAreNotFound() throws IOException {
        TenantPair tenants = fixtures.twoTenants();
        Setup theirs = t.publishable(tenants.b());
        String theirPassport = published(tenants.b(), theirs.batchId()).path("id").asString();
        Tenant a = tenants.a();

        assertThat(publish(a, theirs.batchId())).hasStatus(404);
        assertThat(fixtures.get(a, "/api/v1/batches/" + theirs.batchId() + "/passport-preview")).hasStatus(404);
        assertThat(fixtures.get(a, "/api/v1/batches/" + theirs.batchId() + "/passports")).hasStatus(404);
        assertThat(fixtures.post(a, "/api/v1/batches/" + theirs.batchId() + "/passports/draft", Map.of()))
                .hasStatus(404);
        assertThat(fixtures.get(a, "/api/v1/passports/" + theirPassport)).hasStatus(404);
        assertThat(fixtures.post(a, "/api/v1/passports/" + theirPassport + "/withdraw", Map.of("reason", "x")))
                .hasStatus(404);
        assertThat(fixtures.get(a, "/api/v1/passports/" + UUID.randomUUID())).hasStatus(404);
        // Nothing of the other company changed.
        assertThat(batchStatus(tenants.b(), theirs.batchId())).isEqualTo("PUBLISHED");
        assertThat(versions(tenants.b(), theirs.batchId()).get(0).path("status").asString()).isEqualTo("PUBLISHED");
    }
}
