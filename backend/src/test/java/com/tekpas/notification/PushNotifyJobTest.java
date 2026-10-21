package com.tekpas.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeExpoPushClient;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Who gets which notification, in which language, and what happens to a phone Expo no longer knows. */
@IntegrationTest
class PushNotifyJobTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    @Autowired
    JobQueue queue;

    @Autowired
    FakeExpoPushClient expo;

    @Autowired
    MutableClock clock;

    @Autowired
    ObjectMapper json;

    @AfterEach
    void cleanUp() {
        expo.reset();
        clock.reset();
        jdbc.update("DELETE FROM job WHERE type = 'CERT_EXPIRY_SCAN'");
    }

    record Setup(Tenant owner, String batchNo, String yarnStep, String supplierName) {
    }

    Setup setup(Tenant owner) {
        String productId = fixtures.body(fixtures.post(owner, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Polo", "category", "T_SHIRT"))).path("id").asString();
        JsonNode batch = fixtures.body(fixtures.post(owner, "/api/v1/batches", Map.of("productId", productId,
                "quantity", 1200)));
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batch.path("id").asString() + "/chain"));
        String supplierName = "Ege İplik " + UUID.randomUUID().toString().substring(0, 4);
        String supplierId = fixtures.body(fixtures.post(owner, "/api/v1/suppliers",
                Map.of("name", supplierName, "type", "YARN", "city", "Denizli"))).path("id").asString();
        String yarn = chain.path("steps").valueStream().filter(s -> s.path("stepType").asString().equals("YARN"))
                .findFirst().orElseThrow().path("id").asString();
        assertThat(fixtures.patch(owner, "/api/v1/steps/" + yarn, Map.of("supplierId", supplierId))).hasStatusOk();
        return new Setup(owner, batch.path("batchNo").asString(), yarn, supplierName);
    }

    void submit(Setup s) {
        MvcTestResult link = fixtures.post(s.owner(), "/api/v1/steps/" + s.yarnStep() + "/requests", Map.of());
        assertThat(link).hasStatus(201);
        Map<String, Object> form = Map.of("data", Map.of("fiberComposition", List.of(Map.of("fiber", "COTTON",
                "percent", 100)), "originCountry", "TR"), "submitterName", "Mehmet Kaya");
        ThreadLocalRandom r = ThreadLocalRandom.current();
        assertThat(fixtures.mvc().post().uri("/api/v1/public/request/submit")
                .header("X-Request-Token", fixtures.body(link).path("token").asString())
                .header("X-Forwarded-For", "203.0." + r.nextInt(256) + "." + r.nextInt(1, 255) + ", 10.0.0.1")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(form)).exchange())
                .hasStatusOk();
    }

    String phone(Tenant tenant) {
        String token = "ExponentPushToken[" + UUID.randomUUID().toString().replace("-", "").substring(0, 22) + "]";
        jdbc.update("INSERT INTO push_token (user_id, expo_token, platform) VALUES (?, ?, 'ANDROID')",
                tenant.user().getId(), token);
        return token;
    }

    @Test
    void aSubmissionReachesTheCompanysOwnersAndAdminsInTheirLanguage() {
        Tenant owner = fixtures.tenant();
        Tenant admin = fixtures.member(owner, UserRole.ADMIN);
        jdbc.update("UPDATE app_user SET locale = 'en' WHERE id = ?", admin.user().getId());
        String ownerPhone = phone(owner);
        String adminPhone = phone(admin);
        String editorPhone = phone(fixtures.member(owner, UserRole.EDITOR));
        String viewerPhone = phone(fixtures.member(owner, UserRole.VIEWER));
        String strangerPhone = phone(fixtures.tenant());
        Setup s = setup(owner);

        submit(s);
        worker.runPending();

        List<com.tekpas.notification.PushMessage> sent =
                expo.sentTo(Set.of(ownerPhone, adminPhone, editorPhone, viewerPhone, strangerPhone));
        assertThat(sent).extracting(PushMessage::to).containsExactlyInAnyOrder(ownerPhone, adminPhone);
        PushMessage tr = sent.stream().filter(m -> m.to().equals(ownerPhone)).findFirst().orElseThrow();
        assertThat(tr.title()).isEqualTo("Yeni veri: İplik");
        assertThat(tr.body()).isEqualTo(s.supplierName() + " verisini gönderdi · " + s.batchNo());
        assertThat(tr.data()).containsEntry("url", "/step/" + s.yarnStep());
        PushMessage en = sent.stream().filter(m -> m.to().equals(adminPhone)).findFirst().orElseThrow();
        assertThat(en.title()).isEqualTo("New data: Yarn");
        assertThat(en.body()).isEqualTo(s.supplierName() + " sent their data · " + s.batchNo());
    }

    @Test
    void aPhoneExpoNoLongerKnowsLosesItsTokenAndAReviewedStepIsNotAnnounced() {
        Tenant owner = fixtures.tenant();
        String gone = phone(owner);
        String kept = phone(owner);
        expo.markGone(gone);
        Setup s = setup(owner);

        submit(s);
        worker.runPending();

        assertThat(expo.sentTo(Set.of(gone, kept))).hasSize(2);
        assertThat(jdbc.queryForList("SELECT expo_token FROM push_token WHERE user_id = ?", String.class,
                owner.user().getId())).containsExactly(kept);

        Setup reviewed = setup(owner);
        submit(reviewed);
        assertThat(fixtures.post(owner, "/api/v1/steps/" + reviewed.yarnStep() + "/approve", Map.of())).hasStatusOk();
        worker.runPending();
        assertThat(expo.sentTo(Set.of(kept))).hasSize(1);
    }

    @Test
    void sendsAHundredAtATimeAndTriesAgainWhenExpoIsDown() {
        Tenant owner = fixtures.tenant();
        Set<String> phones = new java.util.HashSet<>();
        for (int i = 0; i < 101; i++) {
            phones.add(phone(owner));
        }
        expo.failNext(1);

        queue.enqueue(JobType.PUSH_NOTIFY, PushNotifyJob.Payload.certificatesExpiring(owner.company().getId(), 2));
        worker.runPending();
        assertThat(expo.sentTo(phones)).isEmpty();

        clock.advance(Duration.ofSeconds(31));
        worker.runPending();
        List<PushMessage> sent = expo.sentTo(phones);
        assertThat(sent).hasSize(101);
        assertThat(expo.calls()).filteredOn(call -> phones.contains(call.getFirst().to()))
                .extracting(List::size).containsExactly(100, 1);
        assertThat(sent.getFirst().body()).isEqualTo("2 sertifikanın süresi 30 gün içinde doluyor");
        assertThat(sent.getFirst().data()).containsEntry("url", "/");
    }

    @Test
    void theDailyScanSendsOneSummaryForCertificatesThatEnteredTheWarningDays() {
        Tenant owner = fixtures.tenant();
        String ownerPhone = phone(owner);
        Setup s = setup(owner);
        worker.runPending();
        LocalDate today = LocalDate.ofInstant(clock.instant(), ZoneId.of("Europe/Istanbul"));
        certificate(owner, s.yarnStep(), "GOTS", today.plusDays(30));
        certificate(owner, s.yarnStep(), "OEKO_TEX", today.plusDays(30));
        certificate(owner, s.yarnStep(), "GRS", today.plusDays(12));

        queue.enqueue(JobType.CERT_EXPIRY_SCAN, Map.of());
        worker.runPending();

        assertThat(expo.sentTo(Set.of(ownerPhone))).singleElement().satisfies(m -> {
            assertThat(m.title()).isEqualTo("Sertifika süreleri");
            assertThat(m.body()).isEqualTo("2 sertifikanın süresi 30 gün içinde doluyor");
        });
    }

    /** A confirmed certificate of the step, written straight to the table (no trigger fires). */
    void certificate(Tenant owner, String stepId, String docType, LocalDate validUntil) {
        String id = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO document (id, company_id, step_id, doc_type, file_key, original_name, mime_type, size_bytes,
                    sha256, cert_no, holder_name, valid_from, valid_until, extraction_status, review_status)
                VALUES (?::uuid, ?, ?::uuid, ?, ?, ?, 'application/pdf', 1000, ?, 'C-1', 'Ege İplik', ?, ?, 'READ',
                    'VERIFIED')
                """, id, owner.company().getId(), stepId, docType, "k/" + id, docType + ".pdf",
                id.replace("-", "") + id.replace("-", "").substring(0, 32), java.sql.Date.valueOf(validUntil.minusYears(1)),
                java.sql.Date.valueOf(validUntil));
    }
}
