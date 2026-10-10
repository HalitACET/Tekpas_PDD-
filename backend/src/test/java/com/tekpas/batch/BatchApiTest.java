package com.tekpas.batch;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.time.Clock;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

@IntegrationTest
class BatchApiTest {

    static final String BATCHES = "/api/v1/batches";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    Clock clock;

    JsonNode createProduct(Tenant tenant, String name) {
        MvcTestResult result = fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", name, "category", "T_SHIRT"));
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    String productId(Tenant tenant) {
        return createProduct(tenant, "Ürün " + UUID.randomUUID().toString().substring(0, 6)).path("id").asString();
    }

    static Map<String, Object> batch(String productId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("productId", productId);
        body.put("batchNo", "L2611A");
        body.put("productionOrderNo", "UE-2026-1142");
        body.put("quantity", 5000);
        body.put("producedFrom", "2026-11-02");
        body.put("producedTo", "2026-11-20");
        return body;
    }

    static Map<String, Object> with(Map<String, Object> body, String field, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put(field, value);
        return copy;
    }

    JsonNode create(Tenant tenant, Map<String, Object> body) {
        MvcTestResult result = fixtures.post(tenant, BATCHES, body);
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    String createBatch(Tenant tenant) {
        return create(tenant, with(batch(productId(tenant)), "batchNo", null)).path("id").asString();
    }

    String todayPrefix() {
        return BatchNumbers.prefix(LocalDate.ofInstant(clock.instant(), BatchNumbers.ZONE));
    }

    void setStatus(String batchId, BatchStatus status) {
        jdbc.update("UPDATE batch SET status = ? WHERE id = ?::uuid", status.name(), batchId);
    }

    void assertFieldError(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        JsonNode problem = fixtures.body(result);
        assertThat(problem.path("type").asString()).isEqualTo("urn:tekpas:problem:validation");
        assertThat(problem.path("errors").valueStream()).anySatisfy(error -> {
            assertThat(error.path("field").asString()).isEqualTo(field);
            assertThat(error.path("code").asString()).isEqualTo(code);
        });
    }

    @Nested
    class Create {

        @Test
        void createsADraftBatchWithProductSummary() {
            Tenant tenant = fixtures.tenant();
            JsonNode product = createProduct(tenant, "Mavi Basic Tişört");

            MvcTestResult result = fixtures.post(tenant, BATCHES, batch(product.path("id").asString()));

            assertThat(result).hasStatus(201);
            JsonNode body = fixtures.body(result);
            assertThat(result.getResponse().getHeader(HttpHeaders.LOCATION))
                    .isEqualTo(BATCHES + "/" + body.path("id").asString());
            assertThat(body.path("batchNo").asString()).isEqualTo("L2611A");
            assertThat(body.path("status").asString()).isEqualTo("DRAFT");
            assertThat(body.path("quantity").asInt()).isEqualTo(5000);
            assertThat(body.path("producedFrom").asString()).isEqualTo("2026-11-02");
            assertThat(body.path("product").path("name").asString()).isEqualTo("Mavi Basic Tişört");
            assertThat(body.path("product").path("gtin").asString()).isEqualTo(product.path("gtin").asString());
            // The product's first batch starts with the default five-step chain (M3).
            assertThat(body.path("chain").path("totalSteps").asInt()).isEqualTo(5);
            assertThat(body.path("chain").path("approvedSteps").asInt()).isZero();
            assertThat(jdbc.queryForObject("SELECT company_id FROM batch WHERE id = ?::uuid", UUID.class,
                    body.path("id").asString())).isEqualTo(tenant.company().getId());
        }

        @Test
        void missingOrEmptyBatchNoGetsTheNextLetterOfTheDayAcrossProducts() {
            Tenant tenant = fixtures.tenant();
            String first = productId(tenant);
            String second = productId(tenant);

            String a = create(tenant, with(batch(first), "batchNo", null)).path("batchNo").asString();
            String b = create(tenant, with(batch(second), "batchNo", "")).path("batchNo").asString();
            // A number typed by the user that looks like a later suggestion moves the sequence on.
            create(tenant, with(batch(first), "batchNo", todayPrefix() + "E"));
            String f = create(tenant, with(batch(second), "batchNo", null)).path("batchNo").asString();

            assertThat(List.of(a, b, f)).containsExactly(todayPrefix() + "A", todayPrefix() + "B", todayPrefix() + "F");
            // Other companies count on their own.
            Tenant other = fixtures.tenant();
            assertThat(create(other, with(batch(productId(other)), "batchNo", null)).path("batchNo").asString())
                    .isEqualTo(todayPrefix() + "A");
        }

        @Test
        void concurrentCreatesGetDifferentLetters() throws Exception {
            Tenant tenant = fixtures.tenant();
            String product = productId(tenant);
            Callable<String> createOne = () -> {
                MvcTestResult result = fixtures.post(tenant, BATCHES, with(batch(product), "batchNo", null));
                assertThat(result).hasStatus(201);
                return fixtures.body(result).path("batchNo").asString();
            };

            ExecutorService pool = Executors.newFixedThreadPool(4);
            try {
                List<Future<String>> futures = pool.invokeAll(List.of(createOne, createOne, createOne, createOne));
                List<String> numbers = futures.stream().map(f -> {
                    try {
                        return f.get();
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                }).toList();
                assertThat(numbers).containsExactlyInAnyOrder(todayPrefix() + "A", todayPrefix() + "B",
                        todayPrefix() + "C", todayPrefix() + "D");
            } finally {
                pool.shutdownNow();
            }
        }

        @Test
        void productOfAnotherCompanyIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = productId(tenants.b());

            MvcTestResult result = fixtures.post(tenants.a(), BATCHES, batch(theirs));

            assertThat(result).hasStatus(404);
            assertThat(fixtures.post(tenants.a(), BATCHES, batch(UUID.randomUUID().toString()))).hasStatus(404);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM batch WHERE product_id = ?::uuid", Integer.class,
                    theirs)).isZero();
        }

        @Test
        void validation() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = batch(productId(tenant));

            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "quantity", 0)), "quantity", "Positive");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "quantity", null)), "quantity", "NotNull");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "quantity", 2.5)), "quantity", "Integer");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "quantity", 2.0)), "quantity", "Integer");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "productId", null)), "productId", "NotNull");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "batchNo", "l2611a")), "batchNo", "Pattern");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "batchNo", "L 2611")), "batchNo", "Pattern");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "batchNo", "A".repeat(21))), "batchNo",
                    "Pattern");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "productionOrderNo", "x".repeat(51))),
                    "productionOrderNo", "Size");
            assertFieldError(fixtures.post(tenant, BATCHES, with(body, "producedTo", "2026-11-01")), "producedTo",
                    "DateRange");
            assertThat(fixtures.post(tenant, BATCHES, with(body, "batchNo", "A".repeat(20)))).hasStatus(201);
        }

        @Test
        void batchNoIsUniqueWithinAProductOnly() {
            Tenant tenant = fixtures.tenant();
            String first = productId(tenant);
            create(tenant, batch(first));

            MvcTestResult duplicate = fixtures.post(tenant, BATCHES, batch(first));

            assertThat(duplicate).hasStatus(409);
            JsonNode problem = fixtures.body(duplicate);
            assertThat(problem.path("type").asString()).isEqualTo("urn:tekpas:problem:conflict");
            assertThat(problem.path("errors").get(0).path("field").asString()).isEqualTo("batchNo");
            assertThat(problem.path("errors").get(0).path("code").asString()).isEqualTo("Unique");
            assertThat(fixtures.post(tenant, BATCHES, batch(productId(tenant)))).hasStatus(201);
        }
    }

    @Nested
    class NextBatchNo {

        @Test
        void suggestsWithoutReserving() {
            Tenant tenant = fixtures.tenant();

            String suggested = fixtures.body(fixtures.get(tenant, BATCHES + "/next-batch-no")).path("batchNo")
                    .asString();

            assertThat(suggested).isEqualTo(todayPrefix() + "A");
            assertThat(fixtures.body(fixtures.get(tenant, BATCHES + "/next-batch-no")).path("batchNo").asString())
                    .isEqualTo(suggested);
            createBatch(tenant);
            assertThat(fixtures.body(fixtures.get(tenant, BATCHES + "/next-batch-no")).path("batchNo").asString())
                    .isEqualTo(todayPrefix() + "B");
        }

        @Test
        void otherCompaniesBatchesDoNotCount() {
            TenantPair tenants = fixtures.twoTenants();
            createBatch(tenants.b());
            createBatch(tenants.b());

            assertThat(fixtures.body(fixtures.get(tenants.a(), BATCHES + "/next-batch-no")).path("batchNo")
                    .asString()).isEqualTo(todayPrefix() + "A");
        }
    }

    @Nested
    class StepStatuses {

        @Test
        void theListCarriesEveryStepStatusInChainOrder() {
            Tenant tenant = fixtures.tenant();
            String batchId = createBatch(tenant);
            String fabric = jdbc.queryForObject(
                    "SELECT id::text FROM supply_step WHERE batch_id = ?::uuid AND step_type = 'FABRIC'", String.class, batchId);
            // A second spinner (DAG), added after the first one: it comes right after it.
            assertThat(fixtures.post(tenant, BATCHES + "/" + batchId + "/steps",
                    Map.of("stepType", "YARN", "outputStepIds", List.of(fabric)))).hasStatus(201);
            jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE batch_id = ?::uuid AND step_type = 'FIBER'", batchId);
            jdbc.update("UPDATE supply_step SET status = 'SUBMITTED' WHERE id = ?::uuid", fabric);
            jdbc.update("""
                    UPDATE supply_step SET status = 'REJECTED' WHERE id = (SELECT id FROM supply_step
                    WHERE batch_id = ?::uuid AND step_type = 'YARN' ORDER BY sort_order DESC LIMIT 1)
                    """, batchId);

            JsonNode row = fixtures.body(fixtures.get(tenant, BATCHES)).path("content").get(0);
            JsonNode chain = fixtures.body(fixtures.get(tenant, BATCHES + "/" + batchId + "/chain"));

            List<String> expected = List.of("APPROVED", "PENDING", "REJECTED", "SUBMITTED", "PENDING", "PENDING");
            assertThat(row.path("chain").path("stepStatuses").valueStream().map(JsonNode::asString)).containsExactlyElementsOf(expected);
            assertThat(row.path("chain").path("totalSteps").asInt()).isEqualTo(6);
            assertThat(row.path("chain").path("approvedSteps").asInt()).isEqualTo(1);
            assertThat(chain.path("summary").path("stepStatuses").valueStream().map(JsonNode::asString))
                    .containsExactlyElementsOf(expected);
            assertThat(chain.path("steps").valueStream().map(step -> step.path("status").asString()))
                    .containsExactlyElementsOf(expected);
        }
    }

    @Nested
    class SupplierFilter {

        String supplier(Tenant tenant) {
            MvcTestResult result = fixtures.post(tenant, "/api/v1/suppliers",
                    Map.of("name", "İplikçi " + UUID.randomUUID().toString().substring(0, 4), "type", "YARN", "city", "Bursa"));
            assertThat(result).hasStatus(201);
            return fixtures.body(result).path("id").asString();
        }

        List<String> yarnSteps(Tenant tenant, String batchId) {
            return fixtures.body(fixtures.get(tenant, BATCHES + "/" + batchId + "/chain")).path("steps").valueStream()
                    .filter(step -> step.path("stepType").asString().equals("YARN"))
                    .map(step -> step.path("id").asString()).toList();
        }

        @Test
        void listsEachBatchWithAStepOfTheSupplierOnce() {
            Tenant tenant = fixtures.tenant();
            String spinner = supplier(tenant);
            String used = createBatch(tenant);
            String unused = createBatch(tenant);
            // Two yarn steps of the same batch, both spun by the same supplier.
            assertThat(fixtures.post(tenant, BATCHES + "/" + used + "/steps", Map.of("stepType", "YARN"))).hasStatus(201);
            for (String step : yarnSteps(tenant, used)) {
                assertThat(fixtures.patch(tenant, "/api/v1/steps/" + step, Map.of("supplierId", spinner))).hasStatusOk();
            }

            JsonNode page = fixtures.body(fixtures.get(tenant, BATCHES + "?supplierId=" + spinner));

            assertThat(page.path("totalElements").asLong()).isEqualTo(1);
            assertThat(page.path("content").valueStream().map(b -> b.path("id").asString())).containsExactly(used);
            assertThat(fixtures.body(fixtures.get(tenant, BATCHES)).path("totalElements").asLong()).isEqualTo(2);
            assertThat(unused).isNotEqualTo(used);
        }

        @Test
        void aSupplierWithoutBatchesGivesAnEmptyList() {
            Tenant tenant = fixtures.tenant();
            createBatch(tenant);

            JsonNode page = fixtures.body(fixtures.get(tenant, BATCHES + "?supplierId=" + supplier(tenant)));

            assertThat(page.path("totalElements").asLong()).isZero();
        }

        @Test
        void aSupplierOutsideTheOwnNetworkIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            createBatch(tenants.a());
            String theirs = supplier(tenants.b());

            for (String id : List.of(theirs, UUID.randomUUID().toString())) {
                MvcTestResult result = fixtures.get(tenants.a(), BATCHES + "?supplierId=" + id);
                assertThat(result).hasStatus(404);
                assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:not-found");
            }
        }
    }

    @Nested
    class StatusCounts {

        @Test
        void countsEveryStatusIncludingZeros() {
            Tenant tenant = fixtures.tenant();
            String product = productId(tenant);
            List<String> ids = List.of(createBatch(tenant), createBatch(tenant), createBatch(tenant),
                    create(tenant, with(batch(product), "batchNo", "B-1")).path("id").asString());
            setStatus(ids.get(1), BatchStatus.COLLECTING);
            setStatus(ids.get(2), BatchStatus.COLLECTING);
            setStatus(ids.get(3), BatchStatus.PUBLISHED);

            MvcTestResult result = fixtures.get(tenant, BATCHES + "/status-counts");

            assertThat(result).hasStatusOk();
            assertThat(fixtures.responseText(result)).isEqualToIgnoringWhitespace(
                    "{\"all\":4,\"DRAFT\":1,\"COLLECTING\":2,\"READY\":0,\"PUBLISHED\":1}");
        }

        @Test
        void aCompanyWithoutBatchesGetsZeros() {
            MvcTestResult result = fixtures.get(fixtures.tenant(), BATCHES + "/status-counts");

            assertThat(fixtures.responseText(result)).isEqualToIgnoringWhitespace(
                    "{\"all\":0,\"DRAFT\":0,\"COLLECTING\":0,\"READY\":0,\"PUBLISHED\":0}");
        }

        @Test
        void otherCompaniesBatchesAreNotCounted() {
            TenantPair tenants = fixtures.twoTenants();
            createBatch(tenants.a());
            createBatch(tenants.b());
            createBatch(tenants.b());

            JsonNode counts = fixtures.body(fixtures.get(tenants.a(), BATCHES + "/status-counts"));

            assertThat(counts.path("all").asLong()).isEqualTo(1);
            assertThat(counts.path("DRAFT").asLong()).isEqualTo(1);
        }

        @Test
        void searchAndFiltersOfTheListDoNotApply() {
            Tenant tenant = fixtures.tenant();
            createBatch(tenant);
            createBatch(tenant);

            JsonNode counts = fixtures.body(fixtures.get(tenant, BATCHES + "/status-counts?q=nothing&status=READY"));

            assertThat(counts.path("all").asLong()).isEqualTo(2);
        }
    }

    @Nested
    class Read {

        @Test
        void getReturnsTheBatchWithChainProgress() {
            Tenant tenant = fixtures.tenant();
            String id = createBatch(tenant);
            jdbc.update("UPDATE supply_step SET status = 'APPROVED' WHERE batch_id = ?::uuid AND step_type = 'FIBER'",
                    id);

            MvcTestResult result = fixtures.get(tenant, BATCHES + "/" + id);

            assertThat(result).hasStatusOk();
            JsonNode chain = fixtures.body(result).path("chain");
            assertThat(chain.path("totalSteps").asInt()).isEqualTo(5);
            assertThat(chain.path("approvedSteps").asInt()).isEqualTo(1);
        }

        @Test
        void batchOfAnotherCompanyIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = createBatch(tenants.b());

            assertThat(fixtures.get(tenants.a(), BATCHES + "/" + theirs)).hasStatus(404);
            assertThat(fixtures.get(tenants.a(), BATCHES + "/" + UUID.randomUUID())).hasStatus(404);
        }

        @Test
        void listShowsOnlyOwnBatchesWithProductAndChain() {
            TenantPair tenants = fixtures.twoTenants();
            JsonNode product = createProduct(tenants.a(), "Keten Gömlek");
            String mine = create(tenants.a(), batch(product.path("id").asString())).path("id").asString();
            String theirs = createBatch(tenants.b());

            JsonNode page = fixtures.body(fixtures.get(tenants.a(), BATCHES));

            assertThat(page.path("totalElements").asLong()).isEqualTo(1);
            JsonNode row = page.path("content").get(0);
            assertThat(row.path("id").asString()).isEqualTo(mine).isNotEqualTo(theirs);
            assertThat(row.path("product").path("name").asString()).isEqualTo("Keten Gömlek");
            assertThat(row.path("product").path("gtin").asString()).isEqualTo(product.path("gtin").asString());
            assertThat(row.path("status").asString()).isEqualTo("DRAFT");
            assertThat(row.path("chain").path("totalSteps").asInt()).isEqualTo(5);
        }

        @Test
        void listFiltersAndSearches() {
            Tenant tenant = fixtures.tenant();
            JsonNode shirt = createProduct(tenant, "Keten Gömlek");
            JsonNode polo = createProduct(tenant, "Organik Polo");
            String shirtBatch = create(tenant, with(with(batch(shirt.path("id").asString()), "batchNo", "KG-1"),
                    "productionOrderNo", "UE-77")).path("id").asString();
            String poloBatch = create(tenant, with(batch(polo.path("id").asString()), "batchNo", "OP-1"))
                    .path("id").asString();
            setStatus(poloBatch, BatchStatus.COLLECTING);

            assertThat(ids(tenant, "?productId=" + shirt.path("id").asString())).containsExactly(shirtBatch);
            assertThat(ids(tenant, "?status=COLLECTING")).containsExactly(poloBatch);
            assertThat(ids(tenant, "?q=kg-")).containsExactly(shirtBatch);
            assertThat(ids(tenant, "?q=ue-77")).containsExactly(shirtBatch);
            assertThat(ids(tenant, "?q=polo")).containsExactly(poloBatch);
            assertThat(ids(tenant, "?q=" + polo.path("gtin").asString().substring(3, 11))).containsExactly(poloBatch);
            assertThat(ids(tenant, "?sort=productName")).containsExactly(shirtBatch, poloBatch);
            assertThat(ids(tenant, "?sort=batchNo,desc")).containsExactly(poloBatch, shirtBatch);
        }

        @Test
        void productFilterOfAnotherCompanyFindsNothing() {
            TenantPair tenants = fixtures.twoTenants();
            JsonNode theirs = createProduct(tenants.b(), "Onların ürünü");
            create(tenants.b(), batch(theirs.path("id").asString()));

            assertThat(ids(tenants.a(), "?productId=" + theirs.path("id").asString())).isEmpty();
        }

        @Test
        void invalidParametersAreFieldErrors() {
            Tenant tenant = fixtures.tenant();

            assertFieldError(fixtures.get(tenant, BATCHES + "?sort=companyId"), "sort", "SortField");
            assertFieldError(fixtures.get(tenant, BATCHES + "?size=0"), "size", "Min");
            assertThat(fixtures.get(tenant, BATCHES + "?status=UNKNOWN")).hasStatus(400);
        }

        private List<String> ids(Tenant tenant, String query) {
            MvcTestResult result = fixtures.get(tenant, BATCHES + query);
            assertThat(result).hasStatusOk();
            return fixtures.body(result).path("content").valueStream().map(b -> b.path("id").asString()).toList();
        }
    }

    @Nested
    class Update {

        @Test
        void changesOnlyTheGivenFieldsAndNullClears() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, batch(productId(tenant))).path("id").asString();

            MvcTestResult result = fixtures.patch(tenant, BATCHES + "/" + id,
                    "{\"quantity\":4200,\"productionOrderNo\":null,\"producedTo\":null}");

            assertThat(result).hasStatusOk();
            JsonNode body = fixtures.body(result);
            assertThat(body.path("quantity").asInt()).isEqualTo(4200);
            assertThat(body.path("productionOrderNo").isNull()).isTrue();
            assertThat(body.path("producedTo").isNull()).isTrue();
            assertThat(body.path("producedFrom").asString()).isEqualTo("2026-11-02");
            assertThat(body.path("batchNo").asString()).isEqualTo("L2611A");
        }

        @Test
        void statusAndProductCannotBeChanged() {
            Tenant tenant = fixtures.tenant();
            String product = productId(tenant);
            String id = create(tenant, batch(product)).path("id").asString();

            MvcTestResult result = fixtures.patch(tenant, BATCHES + "/" + id,
                    Map.of("status", "PUBLISHED", "productId", productId(tenant), "quantity", 7));

            assertThat(result).hasStatusOk();
            JsonNode body = fixtures.body(result);
            assertThat(body.path("status").asString()).isEqualTo("DRAFT");
            assertThat(body.path("product").path("id").asString()).isEqualTo(product);
            assertThat(body.path("quantity").asInt()).isEqualTo(7);
        }

        @Test
        void validationUsesTheMergedValues() {
            Tenant tenant = fixtures.tenant();
            String uri = BATCHES + "/" + create(tenant, batch(productId(tenant))).path("id").asString();

            assertFieldError(fixtures.patch(tenant, uri, Map.of("producedFrom", "2026-12-01")), "producedTo",
                    "DateRange");
            assertFieldError(fixtures.patch(tenant, uri, Map.of("quantity", -1)), "quantity", "Positive");
            assertFieldError(fixtures.patch(tenant, uri, "{\"quantity\":null}"), "quantity", "NotNull");
            assertFieldError(fixtures.patch(tenant, uri, "{\"quantity\":42.5}"), "quantity", "Integer");
            assertFieldError(fixtures.patch(tenant, uri, "{\"batchNo\":null}"), "batchNo", "NotNull");
            assertFieldError(fixtures.patch(tenant, uri, Map.of("batchNo", "kucuk")), "batchNo", "Pattern");
        }

        @Test
        void batchNoChangesOnlyWhileDraftAndStaysUnique() {
            Tenant tenant = fixtures.tenant();
            String product = productId(tenant);
            create(tenant, with(batch(product), "batchNo", "TAKEN"));
            String id = create(tenant, batch(product)).path("id").asString();
            String uri = BATCHES + "/" + id;

            assertThat(fixtures.patch(tenant, uri, Map.of("batchNo", "TAKEN"))).hasStatus(409);
            assertThat(fixtures.patch(tenant, uri, Map.of("batchNo", "L2611B"))).hasStatusOk();

            setStatus(id, BatchStatus.COLLECTING);
            MvcTestResult locked = fixtures.patch(tenant, uri, Map.of("batchNo", "L2611C"));
            assertThat(locked).hasStatus(409);
            assertThat(fixtures.body(locked).path("reason").asString()).isEqualTo("BATCH_NOT_DRAFT");
            // Other fields stay editable.
            assertThat(fixtures.patch(tenant, uri, Map.of("quantity", 9, "batchNo", "L2611B"))).hasStatusOk();
        }

        @Test
        void batchOfAnotherCompanyIsNotFoundAndUnchanged() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = createBatch(tenants.b());

            assertThat(fixtures.patch(tenants.a(), BATCHES + "/" + theirs, Map.of("quantity", 1))).hasStatus(404);
            assertThat(fixtures.body(fixtures.get(tenants.b(), BATCHES + "/" + theirs)).path("quantity").asInt())
                    .isEqualTo(5000);
        }
    }

    @Nested
    class Delete {

        @Test
        void deletesADraftBatch() {
            Tenant tenant = fixtures.tenant();
            String uri = BATCHES + "/" + createBatch(tenant);

            assertThat(fixtures.delete(tenant, uri)).hasStatus(204);
            assertThat(fixtures.get(tenant, uri)).hasStatus(404);
        }

        @Test
        void onlyDraftBatchesCanBeDeleted() {
            Tenant tenant = fixtures.tenant();
            String id = createBatch(tenant);
            setStatus(id, BatchStatus.COLLECTING);

            MvcTestResult result = fixtures.delete(tenant, BATCHES + "/" + id);

            assertThat(result).hasStatus(409);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("BATCH_NOT_DRAFT");
        }

        @Test
        void batchWithAPassportCannotBeDeleted() {
            Tenant tenant = fixtures.tenant();
            String id = createBatch(tenant);
            jdbc.update("""
                    INSERT INTO passport (batch_id, version, status, snapshot, completeness)
                    VALUES (?::uuid, 1, 'WITHDRAWN', '{}'::jsonb, 0)
                    """, id);

            MvcTestResult result = fixtures.delete(tenant, BATCHES + "/" + id);

            assertThat(result).hasStatus(409);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("BATCH_HAS_PASSPORT");
            assertThat(fixtures.get(tenant, BATCHES + "/" + id)).hasStatusOk();
        }

        @Test
        void batchOfAnotherCompanyIsNotFoundAndKept() {
            TenantPair tenants = fixtures.twoTenants();
            String uri = BATCHES + "/" + createBatch(tenants.b());

            assertThat(fixtures.delete(tenants.a(), uri)).hasStatus(404);
            assertThat(fixtures.get(tenants.b(), uri)).hasStatusOk();
        }
    }

    @Nested
    class Roles {

        @Test
        void supplierUsersHaveNoAccess() {
            Tenant owner = fixtures.tenant();
            Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
            String product = productId(owner);
            String uri = BATCHES + "/" + createBatch(owner);

            for (MvcTestResult result : List.of(
                    fixtures.get(supplier, BATCHES),
                    fixtures.get(supplier, BATCHES + "/next-batch-no"),
                    fixtures.get(supplier, BATCHES + "/status-counts"),
                    fixtures.get(supplier, uri),
                    fixtures.post(supplier, BATCHES, batch(product)),
                    fixtures.patch(supplier, uri, Map.of("quantity", 1)),
                    fixtures.delete(supplier, uri))) {
                assertThat(result).hasStatus(403);
                assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:forbidden");
            }
            assertThat(fixtures.get(owner, uri)).hasStatusOk();
        }

        @Test
        void viewersReadButCannotWrite() {
            Tenant owner = fixtures.tenant();
            Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
            String product = productId(owner);
            String uri = BATCHES + "/" + createBatch(owner);

            assertThat(fixtures.get(viewer, BATCHES)).hasStatusOk();
            assertThat(fixtures.get(viewer, BATCHES + "/next-batch-no")).hasStatusOk();
            assertThat(fixtures.get(viewer, BATCHES + "/status-counts")).hasStatusOk();
            assertThat(fixtures.get(viewer, uri)).hasStatusOk();
            assertThat(fixtures.post(viewer, BATCHES, batch(product))).hasStatus(403);
            assertThat(fixtures.patch(viewer, uri, Map.of("quantity", 1))).hasStatus(403);
            assertThat(fixtures.delete(viewer, uri)).hasStatus(403);
        }

        @Test
        void editorsWrite() {
            Tenant owner = fixtures.tenant();
            Tenant editor = fixtures.member(owner, UserRole.EDITOR);

            String id = create(editor, batch(productId(owner))).path("id").asString();

            assertThat(fixtures.patch(editor, BATCHES + "/" + id, Map.of("quantity", 3))).hasStatusOk();
            assertThat(fixtures.delete(editor, BATCHES + "/" + id)).hasStatus(204);
        }
    }
}
