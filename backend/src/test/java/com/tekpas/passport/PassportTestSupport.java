package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.jobs.JobWorker;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

/**
 * A batch the way a manufacturer would have it just before publishing: product with fibres, production dates, the
 * default five-step chain with suppliers on the yarn and fabric steps, every step approved with data, and two
 * confirmed certificates (yarn: GOTS, fabric: OEKO-TEX), which scores 93 (docs/m6-plan.md §2).
 */
public class PassportTestSupport {

    public record Setup(Tenant owner, String productId, String gtin, String batchId, String batchNo,
            Map<String, String> steps) {
    }

    /** Step data with the public fields and a few that must never reach the passport. */
    static final Map<String, String> DATA = Map.of(
            "FIBER", """
                    {"fiberType":"ORGANIC_COTTON","originCountry":"TR","originRegion":"Şanlıurfa","harvestYear":2025,
                     "quantityKg":1000}""",
            "YARN", """
                    {"originCountry":"TR","fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":100}],
                     "yarnCount":"Ne 30/1","energyKwhPerKg":1.2,"deliveredKg":900}""",
            "FABRIC", """
                    {"fiberComposition":[{"fiber":"ORGANIC_COTTON","percent":100}],"fabricType":"Süprem","gsm":180.00,
                     "deliveredKg":800}""",
            "DYEING", """
                    {"dyeProcess":"REACTIVE","chemicalStandards":["ZDHC_MRSL"],"shade":"Ekru","waterLPerKg":80,
                     "deliveredKg":790}""",
            "SEWING", """
                    {"originCountry":"TR","energyKwhPerPiece":0.4}""");

    final TestFixtures fixtures;
    final JdbcTemplate jdbc;
    final JobWorker worker;

    public PassportTestSupport(TestFixtures fixtures, JdbcTemplate jdbc, JobWorker worker) {
        this.fixtures = fixtures;
        this.jdbc = jdbc;
        this.worker = worker;
    }

    /** Product, batch and chain with suppliers; the steps are still pending and without data. */
    Setup prepare(Tenant owner) {
        String gtin = TestGtins.gtin13();
        JsonNode product = fixtures.body(fixtures.post(owner, "/api/v1/products", Map.of("gtin", gtin, "name",
                "Organik Pamuk Polo", "category", "T_SHIRT", "description", "Organik pamuklu polo",
                "declaredFiberComposition", List.of(Map.of("fiber", "ORGANIC_COTTON", "percent", 100)))));
        Map<String, Object> batchBody = new HashMap<>();
        batchBody.put("productId", product.path("id").asString());
        batchBody.put("quantity", 2400);
        batchBody.put("productionOrderNo", "UE-2026-1142");
        batchBody.put("producedFrom", "2026-09-01");
        batchBody.put("producedTo", "2026-09-10");
        JsonNode batch = fixtures.body(fixtures.post(owner, "/api/v1/batches", batchBody));
        String batchId = batch.path("id").asString();
        JsonNode chain = fixtures.body(fixtures.get(owner, "/api/v1/batches/" + batchId + "/chain"));
        Map<String, String> steps = new HashMap<>();
        chain.path("steps").forEach(s -> steps.put(s.path("stepType").asString(), s.path("id").asString()));
        supplier(owner, steps.get("YARN"), "Ege İplik " + shortId(), "YARN", "Denizli");
        supplier(owner, steps.get("FABRIC"), "Demirtaş Örme " + shortId(), "FABRIC", "Bursa");
        return new Setup(owner, product.path("id").asString(), product.path("gtin").asString(), batchId,
                batch.path("batchNo").asString(), steps);
    }

    private void supplier(Tenant owner, String stepId, String name, String type, String city) {
        String id = fixtures.body(fixtures.post(owner, "/api/v1/suppliers", Map.of("name", name, "type", type, "city",
                city, "phone", "+905321234567"))).path("id").asString();
        assertThat(fixtures.patch(owner, "/api/v1/steps/" + stepId, Map.of("supplierId", id))).hasStatusOk();
    }

    /** Every step approved, with data. */
    void approveAll(Setup s) {
        s.steps().forEach((type, id) -> jdbc.update("""
                UPDATE supply_step SET status = 'APPROVED', approved_at = now(), data = ?::jsonb WHERE id = ?::uuid
                """, DATA.get(type), id));
    }

    /** A publishable batch: approved steps and two confirmed certificates valid for a long time. */
    public Setup publishable(Tenant owner) throws IOException {
        Setup s = prepare(owner);
        approveAll(s);
        confirm(s, "YARN", "gots-scope-certificate.pdf", "GOTS", "2099-03-13");
        confirm(s, "FABRIC", "oekotex-standard100.pdf", "OEKO_TEX", "2099-01-01");
        return s;
    }

    String confirm(Setup s, String stepType, String file, String docType, String until) throws IOException {
        String id;
        try (InputStream in = PassportTestSupport.class.getResourceAsStream("/documents/" + file)) {
            assertThat(in).isNotNull();
            id = fixtures.body(fixtures.mvc().post().uri("/api/v1/steps/" + s.steps().get(stepType) + "/documents")
                    .multipart().file(new MockMultipartFile("file", file, "application/pdf", in.readAllBytes()))
                    .header(HttpHeaders.AUTHORIZATION, s.owner().bearer()).exchange()).path("id").asString();
        }
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
        Map<String, Object> body = new HashMap<>();
        body.put("docType", docType);
        body.put("certNo", "DEMO-" + docType);
        body.put("holderName", "Ege İplik");
        body.put("issuer", "Control Union");
        body.put("validFrom", "2019-01-01");
        body.put("validUntil", until);
        assertThat(fixtures.post(s.owner(), "/api/v1/documents/" + id + "/verify", body)).hasStatusOk();
        return id;
    }

    static String shortId() {
        return UUID.randomUUID().toString().substring(0, 4);
    }
}
