package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.TestFiles;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** A batch with its default chain, a yarn supplier on the YARN step, and the calls the document tests make. */
class DocumentTestSupport {

    record Setup(Tenant tenant, String batchId, String yarnStep, String fabricStep, String supplierName) {
    }

    final TestFixtures fixtures;
    final FakeFileStorage storage;
    final ObjectMapper json;

    DocumentTestSupport(TestFixtures fixtures, FakeFileStorage storage, ObjectMapper json) {
        this.fixtures = fixtures;
        this.storage = storage;
        this.json = json;
    }

    Setup setup(Tenant tenant) {
        String productId = fixtures.body(fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Organik tişört", "category", "T_SHIRT"))).path("id").asString();
        String batchId = fixtures.body(fixtures.post(tenant, "/api/v1/batches",
                Map.of("productId", productId, "quantity", 2400))).path("id").asString();
        JsonNode chain = fixtures.body(fixtures.get(tenant, "/api/v1/batches/" + batchId + "/chain"));
        String supplierName = "Karaca Tekstil " + UUID.randomUUID().toString().substring(0, 4);
        String supplierId = fixtures.body(fixtures.post(tenant, "/api/v1/suppliers",
                Map.of("name", supplierName, "type", "YARN", "city", "Bursa"))).path("id").asString();
        String yarn = step(chain, "YARN");
        assertThat(fixtures.patch(tenant, "/api/v1/steps/" + yarn, Map.of("supplierId", supplierId))).hasStatusOk();
        return new Setup(tenant, batchId, yarn, step(chain, "FABRIC"), supplierName);
    }

    static String step(JsonNode chain, String type) {
        return chain.path("steps").valueStream().filter(s -> s.path("stepType").asString().equals(type)).findFirst()
                .orElseThrow().path("id").asString();
    }

    MvcTestResult upload(Tenant tenant, String stepId, byte[] bytes, String name, String declaredType) {
        return fixtures.mvc().post().uri("/api/v1/steps/" + stepId + "/documents").multipart()
                .file(new MockMultipartFile("file", name, declaredType, bytes))
                .header(HttpHeaders.AUTHORIZATION, tenant.bearer()).exchange();
    }

    MvcTestResult uploadPdf(Tenant tenant, String stepId) {
        return upload(tenant, stepId, TestFiles.pdf(), "Sertifika.pdf", "application/pdf");
    }

    String link(Tenant tenant, String stepId) {
        MvcTestResult result = fixtures.post(tenant, "/api/v1/steps/" + stepId + "/requests", Map.of());
        assertThat(result).hasStatus(201);
        return fixtures.body(result).path("token").asString();
    }

    /** Each public client gets its own IP, behind one proxy (application-test.yml). */
    static String randomIp() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return "203.0." + r.nextInt(256) + "." + r.nextInt(1, 255);
    }

    MvcTestResult publicUpload(String token, byte[] bytes, String name, String declaredType) {
        return fixtures.mvc().post().uri("/api/v1/public/request/documents").multipart()
                .file(new MockMultipartFile("file", name, declaredType, bytes))
                .header("X-Request-Token", token).header("X-Forwarded-For", randomIp() + ", 10.0.0.1").exchange();
    }

    MvcTestResult publicPdf(String token) {
        return publicUpload(token, TestFiles.pdf(), "Sertifika.pdf", "application/pdf");
    }

    MvcTestResult publicDelete(String token, String documentId) {
        return fixtures.mvc().delete().uri("/api/v1/public/request/documents/" + documentId)
                .header("X-Request-Token", token).header("X-Forwarded-For", randomIp() + ", 10.0.0.1").exchange();
    }

    MvcTestResult publicOpen(String token) {
        return fixtures.mvc().get().uri("/api/v1/public/request").header("X-Request-Token", token)
                .header("X-Forwarded-For", randomIp() + ", 10.0.0.1").exchange();
    }

    MvcTestResult publicSubmit(String token) {
        Map<String, Object> form = Map.of("data", Map.of("fiberComposition", List.of(Map.of("fiber", "COTTON",
                "percent", 80), Map.of("fiber", "POLYESTER", "percent", 20)), "originCountry", "TR"),
                "submitterName", "Ahmet Kaya");
        return fixtures.mvc().post().uri("/api/v1/public/request/submit").header("X-Request-Token", token)
                .header("X-Forwarded-For", randomIp() + ", 10.0.0.1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(form)).exchange();
    }

    void assertFileError(MvcTestResult result, int status, String code) {
        assertThat(result).hasStatus(status);
        assertThat(fixtures.body(result).path("errors").valueStream()).anySatisfy(e -> {
            assertThat(e.path("field").asString()).isEqualTo("file");
            assertThat(e.path("code").asString()).isEqualTo(code);
        });
    }

    void assertReason(MvcTestResult result, int status, String reason) {
        assertThat(result).hasStatus(status);
        assertThat(fixtures.body(result).path("reason").asString()).isEqualTo(reason);
    }
}
