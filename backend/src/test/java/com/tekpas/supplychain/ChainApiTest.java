package com.tekpas.supplychain;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

@IntegrationTest
class ChainApiTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    String product(Tenant tenant) {
        return fixtures.body(fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Ürün", "category", "T_SHIRT"))).path("id").asString();
    }

    String batch(Tenant tenant, String productId) {
        MvcTestResult result = fixtures.post(tenant, "/api/v1/batches", Map.of("productId", productId, "quantity", 10));
        assertThat(result).hasStatus(201);
        return fixtures.body(result).path("id").asString();
    }

    String supplier(Tenant tenant, String type) {
        return fixtures.body(fixtures.post(tenant, "/api/v1/suppliers",
                Map.of("name", type + " " + UUID.randomUUID().toString().substring(0, 4), "type", type, "city", "Bursa")))
                .path("id").asString();
    }

    JsonNode chain(Tenant tenant, String batchId) {
        MvcTestResult result = fixtures.get(tenant, "/api/v1/batches/" + batchId + "/chain");
        assertThat(result).hasStatusOk();
        return fixtures.body(result);
    }

    static JsonNode step(JsonNode chain, String type) {
        return chain.path("steps").valueStream().filter(s -> s.path("stepType").asString().equals(type)).findFirst()
                .orElseThrow();
    }

    static List<String> inputs(JsonNode step) {
        return step.path("inputStepIds").valueStream().map(JsonNode::asString).toList();
    }

    MvcTestResult patchStep(Tenant tenant, String stepId, Object body) {
        return fixtures.patch(tenant, "/api/v1/steps/" + stepId, body);
    }

    void assertFieldError(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream()).anySatisfy(error -> {
            assertThat(error.path("field").asString()).isEqualTo(field);
            assertThat(error.path("code").asString()).isEqualTo(code);
        });
    }

    @Nested
    class NewBatches {

        @Test
        void theFirstBatchOfAProductGetsTheDefaultChain() {
            Tenant tenant = fixtures.tenant();

            JsonNode chain = chain(tenant, batch(tenant, product(tenant)));

            assertThat(chain.path("steps").valueStream().map(s -> s.path("stepType").asString()))
                    .containsExactly("FIBER", "YARN", "FABRIC", "DYEING", "SEWING");
            assertThat(chain.path("steps").valueStream().map(s -> s.path("status").asString())).containsOnly("PENDING");
            assertThat(inputs(step(chain, "FIBER"))).isEmpty();
            assertThat(inputs(step(chain, "YARN"))).containsExactly(step(chain, "FIBER").path("id").asString());
            assertThat(inputs(step(chain, "SEWING"))).containsExactly(step(chain, "DYEING").path("id").asString());
            assertThat(chain.path("summary").path("totalSteps").asInt()).isEqualTo(5);
            assertThat(chain.path("unassignedStepTypes").valueStream().map(JsonNode::asString))
                    .containsExactly("YARN", "FABRIC", "DYEING", "SEWING");
        }

        @Test
        void aLaterBatchCopiesTheLastChainWithSuppliersButNotStatusOrData() {
            Tenant tenant = fixtures.tenant();
            String productId = product(tenant);
            String first = batch(tenant, productId);
            JsonNode original = chain(tenant, first);
            String yarnSupplier = supplier(tenant, "YARN");
            String yarn = step(original, "YARN").path("id").asString();
            assertThat(patchStep(tenant, yarn, Map.of("supplierId", yarnSupplier, "data",
                    Map.of("yarnCount", "Ne 30/1")))).hasStatusOk();
            // A second spinner that also uses the fiber and feeds the fabric: a DAG.
            assertThat(fixtures.post(tenant, "/api/v1/batches/" + first + "/steps", Map.of("stepType", "YARN",
                    "inputStepIds", List.of(step(original, "FIBER").path("id").asString()),
                    "outputStepIds", List.of(step(original, "FABRIC").path("id").asString())))).hasStatus(201);
            jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE id = ?::uuid", yarn);

            JsonNode copy = chain(tenant, batch(tenant, productId));

            assertThat(copy.path("steps").size()).isEqualTo(6);
            assertThat(copy.path("steps").valueStream().map(s -> s.path("status").asString())).containsOnly("PENDING");
            JsonNode copiedYarn = copy.path("steps").valueStream()
                    .filter(s -> s.path("supplier").path("id").asString().equals(yarnSupplier)).findFirst().orElseThrow();
            assertThat(copiedYarn.path("data").path("yarnCount").isMissingNode()).isTrue();
            JsonNode fabric = step(copy, "FABRIC");
            assertThat(inputs(fabric)).hasSize(2);
            assertThat(copy.path("steps").valueStream().map(s -> s.path("id").asString()))
                    .doesNotContainAnyElementsOf(original.path("steps").valueStream().map(s -> s.path("id").asString())
                            .toList());
        }

        @Test
        void chainPreviewTellsWhatANewBatchStartsWith() {
            TenantPair tenants = fixtures.twoTenants();
            String productId = product(tenants.a());

            JsonNode before = fixtures.body(fixtures.get(tenants.a(), "/api/v1/products/" + productId + "/chain-preview"));
            assertThat(before.path("stepCount").asInt()).isEqualTo(5);
            assertThat(before.path("sourceBatchNo").isNull()).isTrue();

            String first = batch(tenants.a(), productId);
            String batchNo = jdbc.queryForObject("SELECT batch_no FROM batch WHERE id = ?::uuid", String.class, first);
            JsonNode after = fixtures.body(fixtures.get(tenants.a(), "/api/v1/products/" + productId + "/chain-preview"));
            assertThat(after.path("sourceBatchNo").asString()).isEqualTo(batchNo);

            assertThat(fixtures.get(tenants.b(), "/api/v1/products/" + productId + "/chain-preview")).hasStatus(404);
        }

        @Test
        void aBatchWithoutStepsCanGetTheDefaultChainOnce() {
            Tenant tenant = fixtures.tenant();
            String batchId = batch(tenant, product(tenant));
            jdbc.update("DELETE FROM supply_step WHERE batch_id = ?::uuid", batchId);
            String uri = "/api/v1/batches/" + batchId + "/chain";

            assertThat(fixtures.post(tenant, uri, "{}")).hasStatus(201);
            assertThat(chain(tenant, batchId).path("steps").size()).isEqualTo(5);
            MvcTestResult again = fixtures.post(tenant, uri, "{}");
            assertThat(again).hasStatus(409);
            assertThat(fixtures.body(again).path("reason").asString()).isEqualTo("CHAIN_EXISTS");
        }
    }

    @Nested
    class Tenancy {

        @Test
        void anotherCompanysChainAndStepsAreNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = batch(tenants.b(), product(tenants.b()));
            String theirStep = step(chain(tenants.b(), theirs), "YARN").path("id").asString();

            assertThat(fixtures.get(tenants.a(), "/api/v1/batches/" + theirs + "/chain")).hasStatus(404);
            assertThat(fixtures.post(tenants.a(), "/api/v1/batches/" + theirs + "/chain", "{}")).hasStatus(404);
            assertThat(fixtures.post(tenants.a(), "/api/v1/batches/" + theirs + "/steps", Map.of("stepType", "YARN")))
                    .hasStatus(404);
            assertThat(patchStep(tenants.a(), theirStep, Map.of("data", Map.of("yarnCount", "Ne 1")))).hasStatus(404);
            assertThat(fixtures.delete(tenants.a(), "/api/v1/steps/" + theirStep)).hasStatus(404);
            assertThat(fixtures.get(tenants.a(), "/api/v1/batches/" + UUID.randomUUID() + "/chain")).hasStatus(404);
        }

        @Test
        void onlyOwnNetworkSuppliersCanBeAssigned() {
            TenantPair tenants = fixtures.twoTenants();
            String yarn = step(chain(tenants.a(), batch(tenants.a(), product(tenants.a()))), "YARN").path("id").asString();
            String theirSupplier = supplier(tenants.b(), "YARN");

            assertThat(patchStep(tenants.a(), yarn, Map.of("supplierId", theirSupplier))).hasStatus(404);
            assertThat(patchStep(tenants.a(), yarn, Map.of("supplierId", UUID.randomUUID().toString()))).hasStatus(404);
        }

        @Test
        void stepsOfAnotherBatchOrCompanyCannotBeLinked() {
            TenantPair tenants = fixtures.twoTenants();
            String productId = product(tenants.a());
            JsonNode mine = chain(tenants.a(), batch(tenants.a(), productId));
            JsonNode otherBatch = chain(tenants.a(), batch(tenants.a(), productId));
            JsonNode theirs = chain(tenants.b(), batch(tenants.b(), product(tenants.b())));
            String fabric = step(mine, "FABRIC").path("id").asString();

            assertFieldError(patchStep(tenants.a(), fabric, Map.of("inputStepIds",
                    List.of(step(otherBatch, "YARN").path("id").asString()))), "inputStepIds", "SameBatch");
            assertFieldError(patchStep(tenants.a(), fabric, Map.of("inputStepIds",
                    List.of(step(theirs, "YARN").path("id").asString()))), "inputStepIds", "SameBatch");
        }
    }

    @Nested
    class Steps {

        @Test
        void assignsAFittingSupplierAndUnassignsWithNull() {
            Tenant tenant = fixtures.tenant();
            JsonNode chain = chain(tenant, batch(tenant, product(tenant)));
            String dyeing = step(chain, "DYEING").path("id").asString();
            String dyehouse = supplier(tenant, "DYEHOUSE");

            MvcTestResult result = patchStep(tenant, dyeing, Map.of("supplierId", dyehouse));

            assertThat(result).hasStatusOk();
            JsonNode supplier = step(fixtures.body(result), "DYEING").path("supplier");
            assertThat(supplier.path("id").asString()).isEqualTo(dyehouse);
            assertThat(supplier.path("type").asString()).isEqualTo("DYEHOUSE");
            assertThat(fixtures.body(result).path("unassignedStepTypes").valueStream().map(JsonNode::asString))
                    .doesNotContain("DYEING");

            assertThat(step(fixtures.body(patchStep(tenant, dyeing, "{\"supplierId\":null}")), "DYEING")
                    .path("supplier").isNull()).isTrue();
        }

        @Test
        void theSupplierMustFitTheStep() {
            Tenant tenant = fixtures.tenant();
            JsonNode chain = chain(tenant, batch(tenant, product(tenant)));
            String spinner = supplier(tenant, "YARN");

            assertFieldError(patchStep(tenant, step(chain, "DYEING").path("id").asString(), Map.of("supplierId", spinner)),
                    "supplierId", "SupplierType");
            assertFieldError(patchStep(tenant, step(chain, "FIBER").path("id").asString(), Map.of("supplierId", spinner)),
                    "supplierId", "NotApplicable");
        }

        @Test
        void storesTypedDataWithDecimalsAndWholePercentages() {
            Tenant tenant = fixtures.tenant();
            String yarn = step(chain(tenant, batch(tenant, product(tenant))), "YARN").path("id").asString();
            Map<String, Object> data = Map.of(
                    "fiberComposition", List.of(Map.of("fiber", "COTTON", "percent", 80),
                            Map.of("fiber", "POLYESTER", "percent", 20)),
                    "originCountry", "TR",
                    "energySources", List.of(Map.of("source", "GRID", "percent", 60), Map.of("source", "SOLAR", "percent", 40)),
                    "energyKwhPerKg", 3.4,
                    "deliveredKg", 640,
                    "yarnCount", "Ne 30/1",
                    "yarnProcess", "CARDED");

            MvcTestResult result = patchStep(tenant, yarn, Map.of("data", data));

            assertThat(result).hasStatusOk();
            JsonNode stored = step(fixtures.body(result), "YARN").path("data");
            assertThat(stored.path("energyKwhPerKg").decimalValue()).isEqualByComparingTo("3.4");
            assertThat(stored.path("energySources").size()).isEqualTo(2);
            assertThat(stored.path("yarnProcess").asString()).isEqualTo("CARDED");
            assertThat(stored.has("gsm")).isFalse();
        }

        @Test
        void dataIsValidatedPerStepType() {
            Tenant tenant = fixtures.tenant();
            String yarn = step(chain(tenant, batch(tenant, product(tenant))), "YARN").path("id").asString();

            assertFieldError(patchStep(tenant, yarn, Map.of("data", Map.of("gsm", 180, "waterLPerKg", 62))),
                    "data.gsm", "NotApplicable");
            MvcTestResult total = patchStep(tenant, yarn, Map.of("data", Map.of("energySources",
                    List.of(Map.of("source", "GRID", "percent", 60), Map.of("source", "SOLAR", "percent", 39)))));
            assertFieldError(total, "data.energySources", "EnergyTotal");
            assertThat(fixtures.body(total).path("errors").get(0).path("params").path("total").asInt()).isEqualTo(99);
            assertFieldError(patchStep(tenant, yarn, Map.of("data", Map.of("energySources",
                    List.of(Map.of("source", "GRID", "percent", 50), Map.of("source", "GRID", "percent", 50))))),
                    "data.energySources", "EnergyDuplicate");
            assertFieldError(patchStep(tenant, yarn, Map.of("data", Map.of("energySources",
                    List.of(Map.of("source", "GRID", "percent", 99.5), Map.of("source", "SOLAR", "percent", 0.5))))),
                    "data.energySources[0].percent", "Integer");
            assertFieldError(patchStep(tenant, yarn, Map.of("data", Map.of("energyKwhPerKg", -1))),
                    "data.energyKwhPerKg", "Positive");
            assertFieldError(patchStep(tenant, yarn, Map.of("data", Map.of("originCountry", "Türkiye"))),
                    "data.originCountry", "Pattern");
        }

        @Test
        void addsAStepWithInputsAndOutputs() {
            Tenant tenant = fixtures.tenant();
            String batchId = batch(tenant, product(tenant));
            JsonNode chain = chain(tenant, batchId);

            MvcTestResult result = fixtures.post(tenant, "/api/v1/batches/" + batchId + "/steps", Map.of(
                    "stepType", "YARN", "supplierId", supplier(tenant, "YARN"),
                    "inputStepIds", List.of(step(chain, "FIBER").path("id").asString()),
                    "outputStepIds", List.of(step(chain, "FABRIC").path("id").asString())));

            assertThat(result).hasStatus(201);
            JsonNode after = fixtures.body(result);
            assertThat(after.path("steps").size()).isEqualTo(6);
            assertThat(inputs(step(after, "FABRIC"))).hasSize(2);
            List<JsonNode> yarns = after.path("steps").valueStream()
                    .filter(s -> s.path("stepType").asString().equals("YARN")).toList();
            assertThat(yarns).extracting(s -> s.path("sortOrder").asInt()).containsExactly(0, 1);
        }

        @Test
        void linksCannotFormACycleOrPointAtTheStepItself() {
            Tenant tenant = fixtures.tenant();
            JsonNode chain = chain(tenant, batch(tenant, product(tenant)));
            String fiber = step(chain, "FIBER").path("id").asString();
            String sewing = step(chain, "SEWING").path("id").asString();

            // FIBER → … → SEWING already; FIBER using SEWING's output would close the loop.
            assertFieldError(patchStep(tenant, fiber, Map.of("inputStepIds", List.of(sewing))), "inputStepIds", "Cycle");
            assertFieldError(patchStep(tenant, fiber, Map.of("inputStepIds", List.of(fiber))), "inputStepIds", "Cycle");
            assertThat(inputs(step(chain(tenant, chain.path("batchId").asString()), "FIBER"))).isEmpty();
        }

        @Test
        void approvedStepsDoNotChangeAndOnlyPendingStepsAreRemoved() {
            Tenant tenant = fixtures.tenant();
            String batchId = batch(tenant, product(tenant));
            JsonNode chain = chain(tenant, batchId);
            String yarn = step(chain, "YARN").path("id").asString();
            String fabric = step(chain, "FABRIC").path("id").asString();
            jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE id = ?::uuid", yarn);

            MvcTestResult changed = patchStep(tenant, yarn, Map.of("data", Map.of("yarnCount", "Ne 20/1")));
            assertThat(changed).hasStatus(409);
            assertThat(fixtures.body(changed).path("reason").asString()).isEqualTo("STEP_APPROVED");
            MvcTestResult removed = fixtures.delete(tenant, "/api/v1/steps/" + yarn);
            assertThat(removed).hasStatus(409);
            assertThat(fixtures.body(removed).path("reason").asString()).isEqualTo("STEP_NOT_PENDING");

            assertThat(fixtures.delete(tenant, "/api/v1/steps/" + fabric)).hasStatus(204);
            JsonNode after = chain(tenant, batchId);
            assertThat(after.path("steps").size()).isEqualTo(4);
            assertThat(inputs(step(after, "DYEING"))).isEmpty();
        }
    }

    @Nested
    class Roles {

        @Test
        void supplierUsersHaveNoAccessAndViewersOnlyRead() {
            Tenant owner = fixtures.tenant();
            String batchId = batch(owner, product(owner));
            String yarn = step(chain(owner, batchId), "YARN").path("id").asString();
            Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
            Tenant viewer = fixtures.member(owner, UserRole.VIEWER);

            assertThat(fixtures.get(supplier, "/api/v1/batches/" + batchId + "/chain")).hasStatus(403);
            assertThat(patchStep(supplier, yarn, Map.of("data", Map.of("yarnCount", "Ne 1")))).hasStatus(403);
            assertThat(fixtures.get(viewer, "/api/v1/batches/" + batchId + "/chain")).hasStatusOk();
            assertThat(patchStep(viewer, yarn, Map.of("data", Map.of("yarnCount", "Ne 1")))).hasStatus(403);
            assertThat(fixtures.delete(viewer, "/api/v1/steps/" + yarn)).hasStatus(403);
        }
    }
}
