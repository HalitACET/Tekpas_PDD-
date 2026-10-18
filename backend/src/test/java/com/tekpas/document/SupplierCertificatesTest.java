package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The suppliers' "Sertifikalar" column (M5 T7, design v0.5 61): the certificate types a supplier holds, from the
 * documents the manufacturer confirmed on that supplier's steps; red when none of a type is still valid.
 */
@IntegrationTest
class SupplierCertificatesTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    ObjectMapper json;

    @Autowired
    JobWorker worker;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    private String upload(Tenant owner, String stepId, String name) throws IOException {
        try (InputStream in = SupplierCertificatesTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).isNotNull();
            return fixtures.body(t.upload(owner, stepId, in.readAllBytes(), name, "application/pdf")).path("id")
                    .asString();
        }
    }

    private void confirm(Tenant owner, String id, String type, String until) {
        while (worker.runPending() > 0) {
            // every due job, including those of other test classes
        }
        Map<String, Object> body = new HashMap<>();
        body.put("docType", type);
        body.put("certNo", "DEMO-" + type);
        body.put("validFrom", "2019-01-01");
        body.put("validUntil", until);
        assertThat(fixtures.post(owner, "/api/v1/documents/" + id + "/verify", body)).hasStatusOk();
    }

    private JsonNode certificates(Tenant owner, String supplierName) {
        JsonNode list = fixtures.body(fixtures.get(owner, "/api/v1/suppliers?size=100"));
        return list.path("content").valueStream().filter(s -> s.path("name").asString().equals(supplierName))
                .findFirst().orElseThrow().path("certificates");
    }

    @Test
    void confirmedCertificatesAppearOncePerTypeAndExpiredOnesAreMarked() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        confirm(owner, upload(owner, s.yarnStep(), "oekotex-standard100.pdf"), "OEKO_TEX", "2099-01-01");
        confirm(owner, upload(owner, s.yarnStep(), "gots-scope-certificate.pdf"), "GOTS", "2020-06-30");
        confirm(owner, upload(owner, s.yarnStep(), "grs-scope-certificate.pdf"), "GRS", "2020-06-30");
        confirm(owner, upload(owner, s.yarnStep(), "oekotex-expired.pdf"), "GRS", "2099-12-31");

        JsonNode certs = certificates(owner, s.supplierName());

        assertThat(certs.valueStream().map(c -> c.path("type").asString())).containsExactly("OEKO_TEX", "GOTS", "GRS");
        assertThat(certs.get(0).path("expired").asBoolean()).isFalse();
        assertThat(certs.get(1).path("expired").asBoolean()).isTrue();
        assertThat(certs.get(1).path("validUntil").asString()).isEqualTo("2020-06-30");
        // One valid GRS document is enough: the type shows its latest end of validity and is not red.
        assertThat(certs.get(2).path("validUntil").asString()).isEqualTo("2099-12-31");
        assertThat(certs.get(2).path("expired").asBoolean()).isFalse();
    }

    @Test
    void aDocumentNobodyConfirmedAndAnUnrelatedTypeAreNotCertificates() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        upload(owner, s.yarnStep(), "oekotex-standard100.pdf");
        confirm(owner, upload(owner, s.yarnStep(), "technical-sheet.pdf"), "TECH_SHEET", "2099-01-01");

        assertThat(certificates(owner, s.supplierName())).isEmpty();
    }

    @Test
    void theSingleSupplierAnswerCarriesThemToo() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        confirm(owner, upload(owner, s.yarnStep(), "oekotex-standard100.pdf"), "OEKO_TEX", "2099-01-01");
        String id = fixtures.body(fixtures.get(owner, "/api/v1/suppliers?size=100")).path("content").valueStream()
                .filter(x -> x.path("name").asString().equals(s.supplierName())).findFirst().orElseThrow().path("id")
                .asString();

        JsonNode one = fixtures.body(fixtures.get(owner, "/api/v1/suppliers/" + id));

        assertThat(one.path("certificates").valueStream().map(c -> c.path("type").asString()))
                .isEqualTo(List.of("OEKO_TEX"));
    }

    @Test
    void anotherManufacturerNeverSeesTheCertificatesThisOneConfirmed() throws IOException {
        Tenant owner = fixtures.tenant();
        Tenant other = fixtures.tenant();
        Setup s = t.setup(owner);
        confirm(owner, upload(owner, s.yarnStep(), "oekotex-standard100.pdf"), "OEKO_TEX", "2099-01-01");
        String id = fixtures.body(fixtures.get(owner, "/api/v1/suppliers?size=100")).path("content").valueStream()
                .filter(x -> x.path("name").asString().equals(s.supplierName())).findFirst().orElseThrow().path("id")
                .asString();

        assertThat(fixtures.get(other, "/api/v1/suppliers/" + id)).hasStatus(404);
        assertThat(fixtures.body(fixtures.get(other, "/api/v1/suppliers?size=100")).path("content").size()).isZero();
    }
}
