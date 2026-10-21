package com.tekpas.batch;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** A scanned GS1 Digital Link leads to the company's batch (docs/m9-plan.md §4.1). */
@IntegrationTest
class BatchLookupTest {

    @Autowired
    TestFixtures fixtures;

    record Created(String gtin, String batchId) {
    }

    Created batch(Tenant tenant, String batchNo) {
        String gtin = TestGtins.gtin13();
        MvcTestResult product = fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", gtin, "name", "Polo", "category", "T_SHIRT"));
        assertThat(product).hasStatus(201);
        MvcTestResult batch = fixtures.post(tenant, "/api/v1/batches",
                Map.of("productId", fixtures.body(product).path("id").asString(), "batchNo", batchNo, "quantity", 500));
        assertThat(batch).hasStatus(201);
        return new Created(gtin, fixtures.body(batch).path("id").asString());
    }

    MvcTestResult lookup(Tenant tenant, String gtin, String batchNo) {
        return fixtures.get(tenant, "/api/v1/batches/lookup?gtin=" + gtin + "&batchNo=" + batchNo);
    }

    @Test
    void findsTheBatchByGtinInAnyLengthAndBatchNoInAnyCase() {
        Tenant owner = fixtures.tenant();
        Created created = batch(owner, "L2611A");

        MvcTestResult found = lookup(owner, created.gtin(), "l2611a");
        assertThat(found).hasStatusOk();
        assertThat(fixtures.body(found).path("id").asString()).isEqualTo(created.batchId());
        assertThat(fixtures.body(found).path("batchNo").asString()).isEqualTo("L2611A");

        assertThat(fixtures.body(lookup(owner, "0" + created.gtin(), "L2611A")).path("id").asString())
                .isEqualTo(created.batchId());
    }

    @Test
    void answersAnotherCompanysBatchAnUnknownOneAndAnUnreadableCodeAlike() {
        Tenant owner = fixtures.tenant();
        Created created = batch(owner, "L2611B");

        assertThat(lookup(fixtures.tenant(), created.gtin(), "L2611B")).hasStatus(404);
        assertThat(lookup(owner, created.gtin(), "L2611C")).hasStatus(404);
        assertThat(lookup(owner, TestGtins.withWrongCheckDigit(created.gtin()), "L2611B")).hasStatus(404);
        assertThat(lookup(owner, created.gtin(), "L2611B%2F..")).hasStatus(404);
    }

    @Test
    void isForCompanyStaffOnly() {
        Tenant owner = fixtures.tenant();
        Created created = batch(owner, "L2611D");

        assertThat(lookup(fixtures.member(owner, UserRole.VIEWER), created.gtin(), "L2611D")).hasStatusOk();
        assertThat(lookup(fixtures.member(owner, UserRole.SUPPLIER), created.gtin(), "L2611D")).hasStatus(403);
        assertThat(fixtures.mvc().get().uri("/api/v1/batches/lookup?gtin=" + created.gtin() + "&batchNo=L2611D")
                .exchange()).hasStatus(401);
    }
}
