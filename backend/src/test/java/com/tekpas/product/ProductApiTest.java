package com.tekpas.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@IntegrationTest
class ProductApiTest {

    static final String PRODUCTS = "/api/v1/products";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    static Map<String, Object> product(String gtin) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("gtin", gtin);
        body.put("sku", "NG-TS-001");
        body.put("name", "Mavi Basic Tişört");
        body.put("category", "T_SHIRT");
        body.put("declaredFiberComposition", List.of(
                Map.of("fiber", "COTTON", "percent", 95), Map.of("fiber", "ELASTANE", "percent", 5)));
        return body;
    }

    static Map<String, Object> with(Map<String, Object> body, String field, Object value) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put(field, value);
        return copy;
    }

    JsonNode create(Tenant tenant, Map<String, Object> body) {
        MvcTestResult result = fixtures.post(tenant, PRODUCTS, body);
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    JsonNode createProduct(Tenant tenant) {
        return create(tenant, product(TestGtins.gtin13()));
    }

    void addBatch(Tenant tenant, String productId) {
        assertThat(fixtures.post(tenant, "/api/v1/batches", Map.of("productId", productId, "quantity", 10)))
                .hasStatus(201);
    }

    static List<JsonNode> errors(JsonNode problem) {
        return problem.path("errors").valueStream().toList();
    }

    void assertFieldError(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        JsonNode problem = fixtures.body(result);
        assertThat(problem.path("type").asString()).isEqualTo("urn:tekpas:problem:validation");
        assertThat(errors(problem)).anySatisfy(error -> {
            assertThat(error.path("field").asString()).isEqualTo(field);
            assertThat(error.path("code").asString()).isEqualTo(code);
        });
    }

    @Nested
    class Create {

        @Test
        void createsWithNormalizedGtinAndFiberComposition() {
            Tenant tenant = fixtures.tenant();
            String gtin13 = TestGtins.gtin13();

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, product(gtin13));

            assertThat(result).hasStatus(201);
            JsonNode body = fixtures.body(result);
            assertThat(result.getResponse().getHeader(HttpHeaders.LOCATION))
                    .isEqualTo(PRODUCTS + "/" + body.path("id").asString());
            assertThat(body.path("gtin").asString()).isEqualTo("0" + gtin13);
            assertThat(body.path("name").asString()).isEqualTo("Mavi Basic Tişört");
            assertThat(body.path("category").asString()).isEqualTo("T_SHIRT");
            assertThat(body.path("batchCount").asLong()).isZero();
            assertThat(body.path("declaredFiberComposition").toString())
                    .isEqualTo("[{\"fiber\":\"COTTON\",\"percent\":95},{\"fiber\":\"ELASTANE\",\"percent\":5}]");
            assertThat(jdbc.queryForObject("SELECT company_id FROM product WHERE id = ?::uuid", UUID.class,
                    body.path("id").asString())).isEqualTo(tenant.company().getId());
        }

        @Test
        void acceptsGtin8And12AndStoresThemAs14Digits() {
            Tenant tenant = fixtures.tenant();
            // Real GTIN-8/12 examples; delete afterwards because GTINs are unique across all tests.
            for (String[] gtin : new String[][] {{"96385074", "00000096385074"}, {"036000291452", "00036000291452"}}) {
                JsonNode body = create(tenant, with(product(gtin[0]), "declaredFiberComposition", null));
                assertThat(body.path("gtin").asString()).isEqualTo(gtin[1]);
                assertThat(body.path("declaredFiberComposition").isNull()).isTrue();
                assertThat(fixtures.delete(tenant, PRODUCTS + "/" + body.path("id").asString())).hasStatus(204);
            }
        }

        @Test
        void wrongCheckDigitIsAFieldError() {
            Tenant tenant = fixtures.tenant();
            String wrong = TestGtins.withWrongCheckDigit(TestGtins.gtin13());

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, product(wrong));

            assertFieldError(result, "gtin", "GtinCheckDigit");
            assertThat(errors(fixtures.body(result))).hasSize(1);
        }

        @Test
        void malformedGtinReportsFormatOnly() {
            Tenant tenant = fixtures.tenant();

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, product("123456789"));

            assertFieldError(result, "gtin", "GtinFormat");
            assertThat(errors(fixtures.body(result))).hasSize(1);
        }

        @Test
        void requiredFieldsAndLengths() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(with(product(TestGtins.gtin13()), "name", " "), "category", null);

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, with(body, "sku", "x".repeat(61)));

            assertFieldError(result, "name", "NotBlank");
            assertFieldError(result, "category", "NotNull");
            assertFieldError(result, "sku", "Size");
        }

        @Test
        void fiberTotalOf99Or101IsRejectedWithTheTotal() {
            Tenant tenant = fixtures.tenant();
            for (int cotton : new int[] {94, 96}) {
                Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition", List.of(
                        Map.of("fiber", "COTTON", "percent", cotton), Map.of("fiber", "ELASTANE", "percent", 5)));

                MvcTestResult result = fixtures.post(tenant, PRODUCTS, body);

                assertFieldError(result, "declaredFiberComposition", "FiberTotal");
                assertThat(errors(fixtures.body(result)).getFirst().path("params").path("total").asInt())
                        .isEqualTo(cotton + 5);
            }
        }

        @Test
        void sameFiberTwiceIsRejected() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition", List.of(
                    Map.of("fiber", "COTTON", "percent", 50), Map.of("fiber", "COTTON", "percent", 50)));

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, body);

            assertFieldError(result, "declaredFiberComposition", "FiberDuplicate");
            assertThat(errors(fixtures.body(result)).getFirst().path("params").path("fiber").asString())
                    .isEqualTo("COTTON");
        }

        @Test
        void fiberLinesAreValidatedOneByOne() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition", List.of(
                    Map.of("fiber", "POLYAMIDE", "percent", 0), Map.of("fiber", "WOOL", "percent", 100)));

            assertFieldError(fixtures.post(tenant, PRODUCTS, body), "declaredFiberComposition[0].percent", "Min");
        }

        @Test
        void lyocellIsAFiber() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition", List.of(
                    Map.of("fiber", "LYOCELL", "percent", 70), Map.of("fiber", "COTTON", "percent", 30)));

            assertThat(create(tenant, body).path("declaredFiberComposition").get(0).path("fiber").asString())
                    .isEqualTo("LYOCELL");
        }

        @Test
        void fractionalPercentIsAnIntegerErrorNotRounded() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition", List.of(
                    Map.of("fiber", "COTTON", "percent", 95), Map.of("fiber", "ELASTANE", "percent", 5.7)));

            MvcTestResult result = fixtures.post(tenant, PRODUCTS, body);

            assertFieldError(result, "declaredFiberComposition[1].percent", "Integer");
            assertThat(errors(fixtures.body(result))).hasSize(1);
        }

        @Test
        void unreadableBodiesDoNotRevealInternals() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> fraction = with(product(TestGtins.gtin13()), "declaredFiberComposition",
                    List.of(Map.of("fiber", "COTTON", "percent", 99.5)));
            Map<String, Object> unknownFiber = with(product(TestGtins.gtin13()), "declaredFiberComposition",
                    List.of(Map.of("fiber", "NYLON", "percent", 100)));

            for (MvcTestResult result : List.of(
                    fixtures.post(tenant, PRODUCTS, fraction),
                    fixtures.post(tenant, PRODUCTS, unknownFiber),
                    fixtures.post(tenant, PRODUCTS, "{\"gtin\": \"4006381333931\", \"name\": "),
                    fixtures.post(tenant, "/api/v1/batches", Map.of("productId", UUID.randomUUID(), "quantity", 2.5)))) {
                assertThat(result).hasStatus(400);
                String text = fixtures.responseText(result);
                assertThat(text).doesNotContain("com.tekpas", "tools.jackson", "com.fasterxml", "java.lang",
                        "Exception", "Cannot deserialize");
            }
        }

        @Test
        void unknownFiberCodeIsABadRequest() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = with(product(TestGtins.gtin13()), "declaredFiberComposition",
                    List.of(Map.of("fiber", "NYLON", "percent", 100)));

            assertThat(fixtures.post(tenant, PRODUCTS, body)).hasStatus(400);
        }

        @Test
        void takenGtinIsAConflictOnTheGtinField() {
            Tenant tenant = fixtures.tenant();
            String gtin = TestGtins.gtin13();
            create(tenant, product(gtin));

            // Same GTIN in its 14-digit form is the same GTIN.
            MvcTestResult result = fixtures.post(tenant, PRODUCTS, product("0" + gtin));

            assertThat(result).hasStatus(409);
            JsonNode problem = fixtures.body(result);
            assertThat(problem.path("type").asString()).isEqualTo("urn:tekpas:problem:conflict");
            assertThat(errors(problem)).singleElement().satisfies(error -> {
                assertThat(error.path("field").asString()).isEqualTo("gtin");
                assertThat(error.path("code").asString()).isEqualTo("Unique");
            });
        }

        @Test
        void gtinOfAnotherCompanyConflictsWithoutRevealingThatCompany() {
            TenantPair tenants = fixtures.twoTenants();
            String gtin = TestGtins.gtin13();
            String secretName = "Gizli Ürün " + UUID.randomUUID();
            JsonNode theirs = create(tenants.b(), with(product(gtin), "name", secretName));
            String ownGtin = TestGtins.gtin13();
            create(tenants.a(), product(ownGtin));

            MvcTestResult foreign = fixtures.post(tenants.a(), PRODUCTS, product(gtin));
            MvcTestResult own = fixtures.post(tenants.a(), PRODUCTS, product(ownGtin));

            assertThat(foreign).hasStatus(409);
            String text = fixtures.responseText(foreign);
            assertThat(text).doesNotContain(tenants.b().company().getName(), tenants.b().company().getId().toString(),
                    theirs.path("id").asString(), secretName);
            // Exactly the answer a GTIN of the own company gets: nothing tells the two apart.
            assertThat(perRequestFieldsRemoved(fixtures.body(foreign)))
                    .isEqualTo(perRequestFieldsRemoved(fixtures.body(own)));
        }

        /** The path and the request id differ between any two requests; everything else must not. */
        private JsonNode perRequestFieldsRemoved(JsonNode problem) {
            return ((ObjectNode) problem.deepCopy()).without(List.of("instance", "requestId"));
        }
    }

    @Nested
    class Read {

        @Test
        void getReturnsTheProductWithItsBatchCount() {
            Tenant tenant = fixtures.tenant();
            String id = createProduct(tenant).path("id").asString();
            addBatch(tenant, id);
            addBatch(tenant, id);

            MvcTestResult result = fixtures.get(tenant, PRODUCTS + "/" + id);

            assertThat(result).hasStatusOk();
            assertThat(fixtures.body(result).path("batchCount").asLong()).isEqualTo(2);
        }

        @Test
        void productOfAnotherCompanyIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = createProduct(tenants.b()).path("id").asString();

            MvcTestResult result = fixtures.get(tenants.a(), PRODUCTS + "/" + theirs);

            assertThat(result).hasStatus(404);
            assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:not-found");
            assertThat(fixtures.get(tenants.a(), PRODUCTS + "/" + UUID.randomUUID())).hasStatus(404);
        }

        @Test
        void listShowsOnlyOwnProductsWithBatchCounts() {
            TenantPair tenants = fixtures.twoTenants();
            JsonNode first = createProduct(tenants.a());
            createProduct(tenants.a());
            String theirs = createProduct(tenants.b()).path("id").asString();
            addBatch(tenants.a(), first.path("id").asString());

            JsonNode page = fixtures.body(fixtures.get(tenants.a(), PRODUCTS));

            assertThat(page.path("totalElements").asLong()).isEqualTo(2);
            assertThat(page.path("content").valueStream().map(p -> p.path("id").asString()))
                    .hasSize(2).doesNotContain(theirs);
            assertThat(page.path("content").valueStream()
                    .filter(p -> p.path("id").asString().equals(first.path("id").asString()))
                    .findFirst().orElseThrow().path("batchCount").asLong()).isEqualTo(1);
            // Newest first by default.
            assertThat(page.path("content").get(1).path("id").asString()).isEqualTo(first.path("id").asString());
        }

        @Test
        void listSearchesNameSkuAndGtinAndFiltersByCategory() {
            Tenant tenant = fixtures.tenant();
            String gtin = TestGtins.gtin13();
            create(tenant, with(with(product(gtin), "name", "Keten Gömlek"), "sku", "KG-100_A"));
            create(tenant, with(with(product(TestGtins.gtin13()), "name", "Polo"), "category", "SWEATSHIRT"));

            assertThat(names(tenant, "?q=keten")).containsExactly("Keten Gömlek");
            assertThat(names(tenant, "?q=" + gtin.substring(4, 10))).containsExactly("Keten Gömlek");
            assertThat(names(tenant, "?q=G-100_")).containsExactly("Keten Gömlek");
            // LIKE wildcards are literal: "_" does not match any character.
            assertThat(names(tenant, "?q=KG_100")).isEmpty();
            assertThat(names(tenant, "?category=SWEATSHIRT")).containsExactly("Polo");
        }

        @Test
        void listPagesAndSorts() {
            Tenant tenant = fixtures.tenant();
            for (String name : List.of("C", "A", "B")) {
                create(tenant, with(product(TestGtins.gtin13()), "name", name));
            }

            assertThat(names(tenant, "?sort=name")).containsExactly("A", "B", "C");
            assertThat(names(tenant, "?sort=name,desc")).containsExactly("C", "B", "A");
            JsonNode second = fixtures.body(fixtures.get(tenant, PRODUCTS + "?sort=name&size=2&page=1"));
            assertThat(second.path("content").valueStream().map(p -> p.path("name").asString()))
                    .containsExactly("C");
            assertThat(second.path("totalPages").asInt()).isEqualTo(2);
            assertThat(second.path("page").asInt()).isEqualTo(1);
        }

        @Test
        void invalidPagingAndSortAreFieldErrors() {
            Tenant tenant = fixtures.tenant();

            assertFieldError(fixtures.get(tenant, PRODUCTS + "?sort=companyId"), "sort", "SortField");
            assertFieldError(fixtures.get(tenant, PRODUCTS + "?sort=name,up"), "sort", "SortField");
            assertFieldError(fixtures.get(tenant, PRODUCTS + "?size=500"), "size", "Max");
            assertFieldError(fixtures.get(tenant, PRODUCTS + "?page=-1"), "page", "Min");
        }

        private List<String> names(Tenant tenant, String query) {
            MvcTestResult result = fixtures.get(tenant, PRODUCTS + query);
            assertThat(result).hasStatusOk();
            return fixtures.body(result).path("content").valueStream().map(p -> p.path("name").asString()).toList();
        }
    }

    @Nested
    class Update {

        @Test
        void changesOnlyTheGivenFieldsAndNullClears() {
            Tenant tenant = fixtures.tenant();
            String id = createProduct(tenant).path("id").asString();

            MvcTestResult result = fixtures.patch(tenant, PRODUCTS + "/" + id,
                    "{\"name\":\"Lacivert Tişört\",\"sku\":null,\"declaredFiberComposition\":null}");

            assertThat(result).hasStatusOk();
            JsonNode body = fixtures.body(result);
            assertThat(body.path("name").asString()).isEqualTo("Lacivert Tişört");
            assertThat(body.path("sku").isNull()).isTrue();
            assertThat(body.path("declaredFiberComposition").isNull()).isTrue();
            assertThat(body.path("category").asString()).isEqualTo("T_SHIRT");
            JsonNode stored = fixtures.body(fixtures.get(tenant, PRODUCTS + "/" + id));
            assertThat(stored.path("name").asString()).isEqualTo("Lacivert Tişört");
            assertThat(stored.path("updatedAt").asString()).isNotEqualTo(stored.path("createdAt").asString());
        }

        @Test
        void validatesLikeCreateAndRejectsNullForRequiredFields() {
            Tenant tenant = fixtures.tenant();
            String uri = PRODUCTS + "/" + createProduct(tenant).path("id").asString();

            assertFieldError(fixtures.patch(tenant, uri, "{\"gtin\":\""
                    + TestGtins.withWrongCheckDigit(TestGtins.gtin13()) + "\"}"), "gtin", "GtinCheckDigit");
            assertFieldError(fixtures.patch(tenant, uri, "{\"name\":null}"), "name", "NotBlank");
            assertFieldError(fixtures.patch(tenant, uri, "{\"category\":null}"), "category", "NotNull");
            assertFieldError(fixtures.patch(tenant, uri,
                    "{\"declaredFiberComposition\":[{\"fiber\":\"LINEN\",\"percent\":101}]}"),
                    "declaredFiberComposition", "FiberTotal");
        }

        @Test
        void companyIdInTheBodyIsIgnored() {
            TenantPair tenants = fixtures.twoTenants();
            String id = createProduct(tenants.a()).path("id").asString();

            MvcTestResult result = fixtures.patch(tenants.a(), PRODUCTS + "/" + id,
                    "{\"companyId\":\"" + tenants.b().company().getId() + "\",\"name\":\"Z\"}");

            assertThat(result).hasStatusOk();
            assertThat(fixtures.get(tenants.b(), PRODUCTS + "/" + id)).hasStatus(404);
            assertThat(jdbc.queryForObject("SELECT company_id FROM product WHERE id = ?::uuid", UUID.class, id))
                    .isEqualTo(tenants.a().company().getId());
        }

        @Test
        void gtinChangesWhileThereAreNoBatches() {
            Tenant tenant = fixtures.tenant();
            String id = createProduct(tenant).path("id").asString();
            String gtin = TestGtins.gtin13();

            MvcTestResult result = fixtures.patch(tenant, PRODUCTS + "/" + id, Map.of("gtin", gtin));

            assertThat(result).hasStatusOk();
            assertThat(fixtures.body(result).path("gtin").asString()).isEqualTo("0" + gtin);
        }

        @Test
        void gtinIsLockedOnceTheProductHasBatches() {
            Tenant tenant = fixtures.tenant();
            JsonNode product = createProduct(tenant);
            String uri = PRODUCTS + "/" + product.path("id").asString();
            addBatch(tenant, product.path("id").asString());

            MvcTestResult changed = fixtures.patch(tenant, uri, Map.of("gtin", TestGtins.gtin13()));

            assertThat(changed).hasStatus(409);
            JsonNode problem = fixtures.body(changed);
            assertThat(problem.path("type").asString()).isEqualTo("urn:tekpas:problem:gtin-locked");
            assertThat(problem.path("reason").asString()).isEqualTo("GTIN_LOCKED");
            // Sending the current GTIN (in any form) along with other fields is fine.
            String same = product.path("gtin").asString().substring(1);
            assertThat(fixtures.patch(tenant, uri, Map.of("gtin", same, "name", "Yeni ad"))).hasStatusOk();
        }

        @Test
        void gtinTakenByAnotherProductIsAConflict() {
            Tenant tenant = fixtures.tenant();
            JsonNode first = createProduct(tenant);
            String second = createProduct(tenant).path("id").asString();

            MvcTestResult result = fixtures.patch(tenant, PRODUCTS + "/" + second,
                    Map.of("gtin", first.path("gtin").asString()));

            assertThat(result).hasStatus(409);
            assertThat(errors(fixtures.body(result)).getFirst().path("field").asString()).isEqualTo("gtin");
        }

        @Test
        void productOfAnotherCompanyIsNotFoundAndUnchanged() {
            TenantPair tenants = fixtures.twoTenants();
            JsonNode theirs = createProduct(tenants.b());
            String uri = PRODUCTS + "/" + theirs.path("id").asString();

            assertThat(fixtures.patch(tenants.a(), uri, Map.of("name", "Ele geçirildi"))).hasStatus(404);
            assertThat(fixtures.body(fixtures.get(tenants.b(), uri)).path("name").asString())
                    .isEqualTo(theirs.path("name").asString());
        }
    }

    @Nested
    class Delete {

        @Test
        void deletesAProductWithoutBatches() {
            Tenant tenant = fixtures.tenant();
            String uri = PRODUCTS + "/" + createProduct(tenant).path("id").asString();

            assertThat(fixtures.delete(tenant, uri)).hasStatus(204);
            assertThat(fixtures.get(tenant, uri)).hasStatus(404);
        }

        @Test
        void productWithBatchesCannotBeDeleted() {
            Tenant tenant = fixtures.tenant();
            String id = createProduct(tenant).path("id").asString();
            addBatch(tenant, id);

            MvcTestResult result = fixtures.delete(tenant, PRODUCTS + "/" + id);

            assertThat(result).hasStatus(409);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("PRODUCT_HAS_BATCHES");
            assertThat(fixtures.get(tenant, PRODUCTS + "/" + id)).hasStatusOk();
        }

        @Test
        void productOfAnotherCompanyIsNotFoundAndKept() {
            TenantPair tenants = fixtures.twoTenants();
            String uri = PRODUCTS + "/" + createProduct(tenants.b()).path("id").asString();

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
            String uri = PRODUCTS + "/" + createProduct(owner).path("id").asString();

            for (MvcTestResult result : List.of(
                    fixtures.get(supplier, PRODUCTS),
                    fixtures.get(supplier, uri),
                    fixtures.post(supplier, PRODUCTS, product(TestGtins.gtin13())),
                    fixtures.patch(supplier, uri, Map.of("name", "X")),
                    fixtures.delete(supplier, uri))) {
                assertThat(result).hasStatus(403);
                assertThat(fixtures.body(result).path("type").asString()).isEqualTo("urn:tekpas:problem:forbidden");
            }
            assertThat(fixtures.get(owner, uri)).hasStatusOk();
        }

        @Test
        void supplierGets403EvenForAnotherCompanysProduct() {
            TenantPair tenants = fixtures.twoTenants();
            Tenant supplier = fixtures.member(tenants.a(), UserRole.SUPPLIER);
            String theirs = PRODUCTS + "/" + createProduct(tenants.b()).path("id").asString();

            assertThat(fixtures.get(supplier, theirs)).hasStatus(403);
            assertThat(fixtures.get(supplier, PRODUCTS + "/" + UUID.randomUUID())).hasStatus(403);
        }

        @Test
        void viewersReadButCannotWrite() {
            Tenant owner = fixtures.tenant();
            Tenant viewer = fixtures.member(owner, UserRole.VIEWER);
            String uri = PRODUCTS + "/" + createProduct(owner).path("id").asString();

            assertThat(fixtures.get(viewer, PRODUCTS)).hasStatusOk();
            assertThat(fixtures.get(viewer, uri)).hasStatusOk();
            assertThat(fixtures.post(viewer, PRODUCTS, product(TestGtins.gtin13()))).hasStatus(403);
            assertThat(fixtures.patch(viewer, uri, Map.of("name", "X"))).hasStatus(403);
            assertThat(fixtures.delete(viewer, uri)).hasStatus(403);
        }

        @Test
        void editorsAndAdminsWrite() {
            Tenant owner = fixtures.tenant();
            for (UserRole role : List.of(UserRole.ADMIN, UserRole.EDITOR)) {
                Tenant member = fixtures.member(owner, role);
                String id = create(member, product(TestGtins.gtin13())).path("id").asString();
                assertThat(fixtures.patch(member, PRODUCTS + "/" + id, Map.of("name", "Y"))).hasStatusOk();
                assertThat(fixtures.delete(member, PRODUCTS + "/" + id)).hasStatus(204);
            }
        }
    }
}
