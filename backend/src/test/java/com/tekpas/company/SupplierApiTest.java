package com.tekpas.company;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

@IntegrationTest
class SupplierApiTest {

    static final String SUPPLIERS = "/api/v1/suppliers";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    static Map<String, Object> supplier(String name, String type) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("type", type);
        body.put("city", "İzmir");
        body.put("phone", "+902240000000");
        return body;
    }

    JsonNode create(Tenant tenant, String name, String type) {
        MvcTestResult result = fixtures.post(tenant, SUPPLIERS, supplier(name, type));
        assertThat(result).hasStatus(201);
        return fixtures.body(result);
    }

    void assertFieldError(MvcTestResult result, String field, String code) {
        assertThat(result).hasStatus(400);
        assertThat(fixtures.body(result).path("errors").valueStream()).anySatisfy(error -> {
            assertThat(error.path("field").asString()).isEqualTo(field);
            assertThat(error.path("code").asString()).isEqualTo(code);
        });
    }

    /** A batch of the tenant whose YARN step uses the supplier. */
    void useInChain(Tenant tenant, String supplierId) {
        String product = fixtures.body(fixtures.post(tenant, "/api/v1/products",
                Map.of("gtin", TestGtins.gtin13(), "name", "Ürün", "category", "T_SHIRT"))).path("id").asString();
        String batch = fixtures.body(fixtures.post(tenant, "/api/v1/batches",
                Map.of("productId", product, "quantity", 10))).path("id").asString();
        String yarn = jdbc.queryForObject("SELECT id::text FROM supply_step WHERE batch_id = ?::uuid AND step_type = 'YARN'",
                String.class, batch);
        assertThat(fixtures.patch(tenant, "/api/v1/steps/" + yarn, Map.of("supplierId", supplierId))).hasStatusOk();
    }

    @Nested
    class Create {

        @Test
        void createsASupplierCompanyWithoutUsersAndLinksIt() {
            Tenant tenant = fixtures.tenant();

            MvcTestResult result = fixtures.post(tenant, SUPPLIERS, supplier("Aras Örme Konfeksiyon", "SEWING"));

            assertThat(result).hasStatus(201);
            JsonNode body = fixtures.body(result);
            assertThat(body.path("name").asString()).isEqualTo("Aras Örme Konfeksiyon");
            assertThat(body.path("type").asString()).isEqualTo("SEWING");
            assertThat(body.path("city").asString()).isEqualTo("İzmir");
            assertThat(body.path("phone").asString()).isEqualTo("+902240000000");
            assertThat(body.path("batchCount").asLong()).isZero();
            assertThat(body.path("latestStepStatus").isNull()).isTrue();
            assertThat(body.path("editable").asBoolean()).isTrue();
            assertThat(jdbc.queryForObject("SELECT created_by_company_id FROM company WHERE id = ?::uuid", UUID.class,
                    body.path("id").asString())).isEqualTo(tenant.company().getId());
        }

        @Test
        void validation() {
            Tenant tenant = fixtures.tenant();

            assertFieldError(fixtures.post(tenant, SUPPLIERS, supplier("X", "MANUFACTURER")), "type", "SupplierType");
            assertFieldError(fixtures.post(tenant, SUPPLIERS, supplier(" ", "YARN")), "name", "NotBlank");
            Map<String, Object> localPhone = supplier("X", "YARN");
            localPhone.put("phone", "0532 418 77 90");
            assertFieldError(fixtures.post(tenant, SUPPLIERS, localPhone), "phone", "Pattern");
            Map<String, Object> noPhone = supplier("Telefonsuz", "YARN");
            noPhone.put("phone", null);
            assertThat(fixtures.post(tenant, SUPPLIERS, noPhone)).hasStatus(201);
        }

        @Test
        void theCityIsOneOfTheEightyOneProvinces() {
            Tenant tenant = fixtures.tenant();
            Map<String, Object> body = supplier("Şehirli", "YARN");

            for (String city : new String[] {"Paris", "bursa", "Bursa Merkez", "Istanbul"}) {
                body.put("city", city);
                assertFieldError(fixtures.post(tenant, SUPPLIERS, body), "city", "City");
            }
            body.put("city", " Kahramanmaraş ");
            MvcTestResult created = fixtures.post(tenant, SUPPLIERS, body);
            assertThat(created).hasStatus(201);
            assertThat(fixtures.body(created).path("city").asString()).isEqualTo("Kahramanmaraş");

            String id = fixtures.body(created).path("id").asString();
            assertFieldError(fixtures.patch(tenant, SUPPLIERS + "/" + id, Map.of("city", "Atlantis")), "city", "City");
        }
    }

    @Nested
    class Read {

        @Test
        void listShowsOnlyOwnNetworkWithSearchTypeAndSort() {
            TenantPair tenants = fixtures.twoTenants();
            create(tenants.a(), "Çınar Boya Apre", "DYEHOUSE");
            create(tenants.a(), "Bursa İplik San.", "YARN");
            create(tenants.b(), "Başkasının İplikçisi", "YARN");

            JsonNode page = fixtures.body(fixtures.get(tenants.a(), SUPPLIERS));
            assertThat(page.path("totalElements").asLong()).isEqualTo(2);
            assertThat(names(page)).containsExactly("Bursa İplik San.", "Çınar Boya Apre");
            assertThat(names(fixtures.body(fixtures.get(tenants.a(), SUPPLIERS + "?type=YARN"))))
                    .containsExactly("Bursa İplik San.");
            assertThat(names(fixtures.body(fixtures.get(tenants.a(), SUPPLIERS + "?q=zmir")))).hasSize(2);
            assertThat(names(fixtures.body(fixtures.get(tenants.a(), SUPPLIERS + "?q=boya"))))
                    .containsExactly("Çınar Boya Apre");
            assertThat(names(fixtures.body(fixtures.get(tenants.a(), SUPPLIERS + "?sort=name,desc"))))
                    .containsExactly("Çınar Boya Apre", "Bursa İplik San.");
        }

        @Test
        void anotherCompanysSupplierIsNotFound() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = create(tenants.b(), "Onların iplikçisi", "YARN").path("id").asString();

            assertThat(fixtures.get(tenants.a(), SUPPLIERS + "/" + theirs)).hasStatus(404);
            assertThat(fixtures.patch(tenants.a(), SUPPLIERS + "/" + theirs, Map.of("phone", "+905000000000")))
                    .hasStatus(404);
            assertThat(fixtures.delete(tenants.a(), SUPPLIERS + "/" + theirs)).hasStatus(404);
            assertThat(fixtures.get(tenants.b(), SUPPLIERS + "/" + theirs)).hasStatusOk();
        }

        @Test
        void batchCountAndLatestStatusComeFromOwnChains() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, "Bursa İplik San.", "YARN").path("id").asString();

            useInChain(tenant, id);

            JsonNode body = fixtures.body(fixtures.get(tenant, SUPPLIERS + "/" + id));
            assertThat(body.path("batchCount").asLong()).isEqualTo(1);
            assertThat(body.path("latestStepStatus").asString()).isEqualTo("PENDING");
        }

        private List<String> names(JsonNode page) {
            return page.path("content").valueStream().map(s -> s.path("name").asString()).toList();
        }
    }

    @Nested
    class Update {

        @Test
        void ownSupplierWithoutUsersCanBeRenamedMovedAndRetyped() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, "Aras Örme", "FABRIC").path("id").asString();

            MvcTestResult result = fixtures.patch(tenant, SUPPLIERS + "/" + id,
                    "{\"name\":\"Aras Örme Konfeksiyon\",\"city\":\"Manisa\",\"type\":\"SEWING\",\"phone\":null}");

            assertThat(result).hasStatusOk();
            JsonNode body = fixtures.body(result);
            assertThat(body.path("name").asString()).isEqualTo("Aras Örme Konfeksiyon");
            assertThat(body.path("city").asString()).isEqualTo("Manisa");
            assertThat(body.path("type").asString()).isEqualTo("SEWING");
            assertThat(body.path("phone").isNull()).isTrue();
        }

        @Test
        void aSupplierWithUsersOnlyChangesTheLinkPhone() {
            Tenant tenant = fixtures.tenant();
            Company withUsers = fixtures.company();
            fixtures.user(withUsers, UserRole.SUPPLIER);
            link(tenant, withUsers.getId());
            String uri = SUPPLIERS + "/" + withUsers.getId();

            assertThat(fixtures.body(fixtures.get(tenant, uri)).path("editable").asBoolean()).isFalse();
            MvcTestResult rename = fixtures.patch(tenant, uri, Map.of("name", "Yeni ad"));
            assertThat(rename).hasStatus(409);
            assertThat(fixtures.body(rename).path("reason").asString()).isEqualTo("SUPPLIER_NOT_EDITABLE");
            assertThat(fixtures.patch(tenant, uri, Map.of("phone", "+905551112233"))).hasStatusOk();
            assertThat(jdbc.queryForObject("SELECT name FROM company WHERE id = ?", String.class, withUsers.getId()))
                    .isEqualTo(withUsers.getName());
        }

        @Test
        void aSupplierCreatedByAnotherCompanyOnlyChangesTheLinkPhone() {
            TenantPair tenants = fixtures.twoTenants();
            String theirs = create(tenants.b(), "B'nin iplikçisi", "YARN").path("id").asString();
            link(tenants.a(), UUID.fromString(theirs));
            String uri = SUPPLIERS + "/" + theirs;

            assertThat(fixtures.body(fixtures.get(tenants.a(), uri)).path("editable").asBoolean()).isFalse();
            assertThat(fixtures.patch(tenants.a(), uri, Map.of("city", "Uşak"))).hasStatus(409);
            assertThat(fixtures.patch(tenants.a(), uri, Map.of("phone", "+905551112233"))).hasStatusOk();
            // The phone belongs to A's link only.
            assertThat(fixtures.body(fixtures.get(tenants.b(), uri)).path("phone").asString()).isEqualTo("+902240000000");
        }

        @Test
        void theTypeOfASupplierInUseCannotChange() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, "Bursa İplik San.", "YARN").path("id").asString();
            useInChain(tenant, id);

            MvcTestResult result = fixtures.patch(tenant, SUPPLIERS + "/" + id, Map.of("type", "FABRIC"));

            assertThat(result).hasStatus(409);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("SUPPLIER_TYPE_IN_USE");
            assertThat(fixtures.body(fixtures.get(tenant, SUPPLIERS + "/" + id)).path("type").asString()).isEqualTo("YARN");
            // Name, city and phone still change: only the type is tied to the steps.
            MvcTestResult other = fixtures.patch(tenant, SUPPLIERS + "/" + id,
                    Map.of("name", "Bursa İplik A.Ş.", "city", "Denizli", "phone", "+902240000009"));
            assertThat(other).hasStatusOk();
            assertThat(fixtures.body(other).path("phone").asString()).isEqualTo("+902240000009");
        }

        private void link(Tenant tenant, UUID supplierId) {
            jdbc.update("INSERT INTO company_supplier (manufacturer_id, supplier_id) VALUES (?, ?)",
                    tenant.company().getId(), supplierId);
        }
    }

    @Nested
    class Remove {

        @Test
        void anUnusedSupplierIsRemovedTogetherWithItsCompany() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, "Geçici", "ACCESSORY").path("id").asString();

            assertThat(fixtures.delete(tenant, SUPPLIERS + "/" + id)).hasStatus(204);
            assertThat(fixtures.get(tenant, SUPPLIERS + "/" + id)).hasStatus(404);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM company WHERE id = ?::uuid", Integer.class, id))
                    .isZero();
        }

        @Test
        void aSupplierLinkedToAnotherCompanyKeepsItsCompany() {
            TenantPair tenants = fixtures.twoTenants();
            String id = create(tenants.a(), "Ortak tedarikçi", "YARN").path("id").asString();
            jdbc.update("INSERT INTO company_supplier (manufacturer_id, supplier_id) VALUES (?, ?::uuid)",
                    tenants.b().company().getId(), id);

            assertThat(fixtures.delete(tenants.a(), SUPPLIERS + "/" + id)).hasStatus(204);
            assertThat(fixtures.get(tenants.b(), SUPPLIERS + "/" + id)).hasStatusOk();
        }

        @Test
        void aSupplierInUseCannotBeRemoved() {
            Tenant tenant = fixtures.tenant();
            String id = create(tenant, "Bursa İplik San.", "YARN").path("id").asString();
            useInChain(tenant, id);

            MvcTestResult result = fixtures.delete(tenant, SUPPLIERS + "/" + id);

            assertThat(result).hasStatus(409);
            assertThat(fixtures.body(result).path("reason").asString()).isEqualTo("SUPPLIER_IN_USE");
        }
    }

    @Nested
    class Roles {

        @Test
        void supplierUsersHaveNoAccessAndViewersOnlyRead() {
            Tenant owner = fixtures.tenant();
            String uri = SUPPLIERS + "/" + create(owner, "Bursa İplik San.", "YARN").path("id").asString();
            Tenant supplier = fixtures.member(owner, UserRole.SUPPLIER);
            Tenant viewer = fixtures.member(owner, UserRole.VIEWER);

            for (MvcTestResult result : List.of(fixtures.get(supplier, SUPPLIERS), fixtures.get(supplier, uri),
                    fixtures.post(supplier, SUPPLIERS, supplier("X", "YARN")))) {
                assertThat(result).hasStatus(403);
            }
            assertThat(fixtures.get(viewer, SUPPLIERS)).hasStatusOk();
            assertThat(fixtures.get(viewer, uri)).hasStatusOk();
            assertThat(fixtures.post(viewer, SUPPLIERS, supplier("X", "YARN"))).hasStatus(403);
            assertThat(fixtures.patch(viewer, uri, Map.of("phone", "+905000000000"))).hasStatus(403);
            assertThat(fixtures.delete(viewer, uri)).hasStatus(403);
        }
    }
}
