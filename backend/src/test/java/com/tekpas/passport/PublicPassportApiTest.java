package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.passport.PassportTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * The public passport (no account) and the QR code endpoints (M6 T3, docs/m6-plan.md §4–5.1): what a scan resolves to
 * in each state, what the answer holds and what it does not, and who may fetch the QR images.
 */
@IntegrationTest
class PublicPassportApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

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

    /** Each client gets its own IP behind one proxy (application-test.yml), so the rate limits do not meet. */
    static String randomIp() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return "203.0." + r.nextInt(256) + "." + r.nextInt(1, 255) + ", 10.0.0.1";
    }

    private MvcTestResult scan(String gtin, String batchNo) {
        return scan(gtin, batchNo, randomIp());
    }

    private MvcTestResult scan(String gtin, String batchNo, String forwardedFor) {
        return fixtures.mvc().get().uri("/api/v1/public/passports/01/" + gtin + "/10/" + batchNo)
                .header("X-Forwarded-For", forwardedFor).exchange();
    }

    private JsonNode publish(Setup s) {
        MvcTestResult result = fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/passports", Map.of());
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    @Test
    void aScanShowsThePublishedPassportWithoutAnAccount() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        JsonNode version = publish(s);

        MvcTestResult result = scan(s.gtin(), s.batchNo());

        assertThat(result).hasStatusOk();
        JsonNode body = fixtures.body(result);
        assertThat(body.propertyNames()).containsExactlyInAnyOrder("verificationCode", "snapshot");
        assertThat(body.path("verificationCode").asString()).isEqualTo(version.path("verificationCode").asString());
        assertThat(body.path("snapshot").path("passport").path("version").asInt()).isEqualTo(1);
        assertThat(body.path("snapshot").path("product").path("name").asString()).isEqualTo("Organik Pamuk Polo");
        assertThat(body.path("snapshot").path("supplyChain")).hasSize(5);
        // Nothing internal: no score, no id of any kind.
        assertThat(body.toString()).doesNotContain("completeness", "score", "withdraw", "publishedBy")
                .doesNotContainPattern(PassportApiTest.UUID_TEXT.pattern());
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("public").contains("max-age=60");
        assertThat(result.getResponse().getHeader("X-Robots-Tag")).isEqualTo("noindex");
    }

    @Test
    void aGtin13AndALowerCaseBatchNumberFindTheSamePassport() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        publish(s);
        String gtin13 = s.gtin().substring(1);

        assertThat(scan(gtin13, s.batchNo().toLowerCase())).hasStatusOk();
        assertThat(scan(s.gtin(), s.batchNo())).hasStatusOk();
    }

    @Test
    void aCodeWithoutAPublishedPassportIsNotFoundAndSaysNothingElse() {
        Setup s = t.prepare(fixtures.tenant());

        MvcTestResult draft = scan(s.gtin(), s.batchNo());
        MvcTestResult unknown = scan(s.gtin(), "NOSUCH-1");
        MvcTestResult badCheckDigit = scan(s.gtin().substring(0, 13) + (s.gtin().charAt(13) == '0' ? "1" : "0"),
                s.batchNo());
        MvcTestResult garbage = scan("abc", "!!");

        for (MvcTestResult r : new MvcTestResult[] {draft, unknown, badCheckDigit, garbage}) {
            assertThat(r).hasStatus(404);
            JsonNode body = fixtures.body(r);
            assertThat(body.path("reason").asString()).isEqualTo("PASSPORT_NOT_FOUND");
            assertThat(body.path("type").asString()).endsWith("passport-not-found");
            // An error is never cached: it must not outlive the publishing that makes it a 200.
            assertThat(r.getResponse().getHeader("Cache-Control")).doesNotContain("public");
        }
        // A draft and an unknown code look the same.
        assertThat(fixtures.body(draft).path("detail").asString())
                .isEqualTo(fixtures.body(unknown).path("detail").asString());
    }

    @Test
    void aWithdrawnPassportIsGoneWithItsDateButNotItsReason() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        String id = publish(s).path("id").asString();
        assertThat(fixtures.post(s.owner(), "/api/v1/passports/" + id + "/withdraw", Map.of("reason", "İÇ-GEREKÇE")))
                .hasStatusOk();

        MvcTestResult result = scan(s.gtin(), s.batchNo());

        assertThat(result).hasStatus(410);
        JsonNode body = fixtures.body(result);
        assertThat(body.path("reason").asString()).isEqualTo("PASSPORT_WITHDRAWN");
        assertThat(body.path("withdrawnAt").asString()).isNotBlank();
        assertThat(body.toString()).doesNotContain("İÇ-GEREKÇE");
        assertThat(result.getResponse().getHeader("Cache-Control")).doesNotContain("public");
    }

    @Test
    void theSameCodeShowsTheNewVersionOnceItIsPublishedAndTheOldOneUntilThen() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        publish(s);
        // Open a new version: the published one keeps answering.
        assertThat(fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of()))
                .hasStatusOk();
        assertThat(fixtures.body(scan(s.gtin(), s.batchNo()))
                .path("snapshot").path("passport").path("version").asInt()).isEqualTo(1);

        publish(s);

        JsonNode now = fixtures.body(scan(s.gtin(), s.batchNo()));
        assertThat(now.path("snapshot").path("passport").path("version").asInt()).isEqualTo(2);
        // An old version cannot be asked for: the parameter is ignored.
        MvcTestResult old = fixtures.mvc().get().uri("/api/v1/public/passports/01/" + s.gtin() + "/10/" + s.batchNo()
                + "?v=1").header("X-Forwarded-For", randomIp()).exchange();
        assertThat(fixtures.body(old).path("snapshot").path("passport").path("version").asInt()).isEqualTo(2);
    }

    @Test
    void aWithdrawnVersionStaysGoneEvenWhenTheBatchIsEditedAgain() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        String id = publish(s).path("id").asString();
        fixtures.post(s.owner(), "/api/v1/passports/" + id + "/withdraw", Map.of("reason", "x"));

        // Editing and a draft change nothing for the scan until the next publishing.
        assertThat(scan(s.gtin(), s.batchNo())).hasStatus(410);
        publish(s);
        assertThat(scan(s.gtin(), s.batchNo())).hasStatusOk();
    }

    @Test
    void theScanIsRateLimitedPerClient() throws IOException {
        Setup s = t.prepare(fixtures.tenant());
        String ip = randomIp();

        int tooMany = 0;
        for (int i = 0; i < PublicPassportController.PER_IP_PER_MINUTE + 5; i++) {
            if (scan(s.gtin(), s.batchNo(), ip).getResponse().getStatus() == 429) {
                tooMany++;
            }
        }

        assertThat(tooMany).isEqualTo(5);
        assertThat(scan(s.gtin(), s.batchNo()).getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void thePassportResponseCarriesTheAddressTheQrCodeHolds() throws IOException {
        Setup s = t.publishable(fixtures.tenant());

        JsonNode version = publish(s);

        assertThat(version.path("digitalLink").asString())
                .isEqualTo("http://localhost:3000/01/" + s.gtin() + "/10/" + s.batchNo());
    }

    @Test
    void theQrPngReadsBackAsTheAddress() throws Exception {
        Setup s = t.publishable(fixtures.tenant());
        JsonNode version = publish(s);
        String id = version.path("id").asString();

        MvcTestResult small = fixtures.get(s.owner(), "/api/v1/passports/" + id + "/qr.png");
        MvcTestResult big = fixtures.get(s.owner(), "/api/v1/passports/" + id + "/qr.png?size=1024");

        assertThat(small).hasStatusOk();
        assertThat(small.getResponse().getContentType()).isEqualTo("image/png");
        assertThat(small.getResponse().getHeader("Content-Disposition")).contains("qr-" + s.batchNo() + ".png");
        BufferedImage a = ImageIO.read(new ByteArrayInputStream(small.getResponse().getContentAsByteArray()));
        BufferedImage b = ImageIO.read(new ByteArrayInputStream(big.getResponse().getContentAsByteArray()));
        assertThat(QrCodesTest.decode(a)).isEqualTo(version.path("digitalLink").asString());
        assertThat(QrCodesTest.decode(b)).isEqualTo(version.path("digitalLink").asString());
        assertThat(b.getWidth()).isGreaterThan(a.getWidth());
        // The code holds no version: the next version has the very same QR.
        fixtures.post(s.owner(), "/api/v1/batches/" + s.batchId() + "/passports/draft", Map.of());
        String v2 = publish(s).path("id").asString();
        BufferedImage again = ImageIO.read(new ByteArrayInputStream(
                fixtures.get(s.owner(), "/api/v1/passports/" + v2 + "/qr.png").getResponse().getContentAsByteArray()));
        assertThat(QrCodesTest.decode(again)).isEqualTo(version.path("digitalLink").asString());
    }

    @Test
    void theQrSvgAndTheSizeCheck() throws IOException {
        Setup s = t.publishable(fixtures.tenant());
        String id = publish(s).path("id").asString();

        MvcTestResult svg = fixtures.get(s.owner(), "/api/v1/passports/" + id + "/qr.svg");

        assertThat(svg).hasStatusOk();
        assertThat(svg.getResponse().getContentType()).isEqualTo("image/svg+xml");
        assertThat(svg.getResponse().getContentAsString()).contains("<svg").contains("viewBox");
        assertThat(fixtures.get(s.owner(), "/api/v1/passports/" + id + "/qr.png?size=300")).hasStatus(400);
    }

    @Test
    void theQrImagesAreForTheCompanysUsersOnly() throws IOException {
        TenantPair tenants = fixtures.twoTenants();
        Setup s = t.publishable(tenants.a());
        String id = publish(s).path("id").asString();
        Tenant viewer = fixtures.member(tenants.a(), UserRole.VIEWER);
        Tenant supplier = fixtures.member(tenants.a(), UserRole.SUPPLIER);

        assertThat(fixtures.get(viewer, "/api/v1/passports/" + id + "/qr.png")).hasStatusOk();
        assertThat(fixtures.get(supplier, "/api/v1/passports/" + id + "/qr.png")).hasStatus(403);
        assertThat(fixtures.get(supplier, "/api/v1/passports/" + id + "/qr.svg")).hasStatus(403);
        assertThat(fixtures.get(tenants.b(), "/api/v1/passports/" + id + "/qr.png")).hasStatus(404);
        assertThat(fixtures.get(tenants.b(), "/api/v1/passports/" + id + "/qr.svg")).hasStatus(404);
        assertThat(fixtures.get(tenants.a(), "/api/v1/passports/" + UUID.randomUUID() + "/qr.png")).hasStatus(404);
        assertThat(fixtures.mvc().get().uri("/api/v1/passports/" + id + "/qr.png").exchange()).hasStatus(401);
    }
}
