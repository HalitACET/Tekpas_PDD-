package com.tekpas.audit;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.jobs.JobWorker;
import com.tekpas.passport.PassportTestSupport;
import com.tekpas.passport.PassportTestSupport.Setup;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import com.tekpas.support.TestGtins;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

/**
 * The audit trail (M12 T4, docs/m12-plan.md §6). PLAN acceptance: every publishing shows up in it. Entries are the
 * company's own; OWNER and ADMIN read them.
 */
@IntegrationTest
class AuditApiTest {

    private static final String AUDIT = "/api/v1/audit";

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JobWorker worker;

    private JsonNode entries(Tenant tenant, String query) {
        MvcTestResult result = fixtures.get(tenant, AUDIT + query);
        assertThat(result).hasStatusOk();
        return fixtures.body(result).path("entries");
    }

    private static List<String> actions(JsonNode entries) {
        return entries.valueStream().map(e -> e.path("entityType").asString() + ":" + e.path("action").asString())
                .toList();
    }

    @Test
    void aPublishingIsInTheTrailWithWhoTheBatchAndTheVersion() throws IOException {
        Tenant owner = fixtures.tenant();
        Setup s = new PassportTestSupport(fixtures, jdbc, worker).publishable(owner);

        assertThat(fixtures.post(owner, "/api/v1/batches/" + s.batchId() + "/passports", Map.of())).hasStatus(201);

        JsonNode publish = entries(owner, "?entityType=PASSPORT").get(0);
        assertThat(publish.path("action").asString()).isEqualTo("PUBLISH");
        assertThat(publish.path("userName").asString()).isEqualTo(owner.user().getFullName());
        assertThat(publish.path("label").asString()).isEqualTo(s.batchNo());
        assertThat(publish.path("batchId").asString()).isEqualTo(s.batchId());
        assertThat(publish.path("details").path("version").asInt()).isEqualTo(1);
        // The batch's history: the publishing and the batch's own entries, nothing of other batches.
        assertThat(actions(entries(owner, "?batchId=" + s.batchId()))).contains("PASSPORT:PUBLISH", "BATCH:CREATE")
                .doesNotContain("PRODUCT:CREATE");
    }

    @Test
    void changesAreNamedByFieldAndADeletedRecordKeepsItsLabel() {
        Tenant owner = fixtures.tenant();
        String id = fixtures.body(fixtures.post(owner, "/api/v1/products", Map.of("gtin", TestGtins.gtin13(), "name",
                "Keten Gömlek", "category", "SHIRT"))).path("id").asString();
        assertThat(fixtures.patch(owner, "/api/v1/products/" + id, Map.of("name", "Keten Gömlek Beyaz",
                "description", "Yazlık"))).hasStatusOk();
        assertThat(fixtures.delete(owner, "/api/v1/products/" + id)).hasStatus(204);

        JsonNode products = entries(owner, "?entityType=PRODUCT");

        assertThat(actions(products)).containsExactly("PRODUCT:DELETE", "PRODUCT:UPDATE", "PRODUCT:CREATE");
        assertThat(products.valueStream().map(e -> e.path("label").asString()))
                .containsOnly("Keten Gömlek Beyaz", "Keten Gömlek");
        assertThat(products.get(1).path("details").path("fields").valueStream().map(JsonNode::asString))
                .containsExactly("name", "description");
        // The text itself is not in the trail.
        assertThat(fixtures.responseText(fixtures.get(owner, AUDIT))).doesNotContain("Yazlık");
    }

    @Test
    void filtersCombineAndPagesGoBackInTime() {
        Tenant owner = fixtures.tenant();
        Tenant admin = fixtures.member(owner, UserRole.ADMIN);
        for (Tenant who : List.of(owner, admin, owner)) {
            fixtures.post(who, "/api/v1/products", Map.of("gtin", TestGtins.gtin13(), "name", "Ürün", "category",
                    "SHIRT"));
        }

        assertThat(entries(owner, "?userId=" + admin.user().getId())).hasSize(1);
        JsonNode first = fixtures.body(fixtures.get(owner, AUDIT + "?size=2"));
        assertThat(first.path("entries")).hasSize(2);
        long before = first.path("nextBefore").asLong();
        JsonNode second = fixtures.body(fixtures.get(owner, AUDIT + "?size=2&before=" + before));
        assertThat(second.path("entries")).hasSize(1);
        assertThat(second.path("nextBefore").isNull()).isTrue();
        assertThat(entries(owner, "?from=2000-01-01&to=2000-01-02")).isEmpty();
    }

    @Test
    void onlyOwnersAndAdminsReadAndOnlyTheirOwnCompany() {
        TenantPair tenants = fixtures.twoTenants();
        fixtures.post(tenants.a(), "/api/v1/products", Map.of("gtin", TestGtins.gtin13(), "name", "Gizli",
                "category", "SHIRT"));

        assertThat(fixtures.responseText(fixtures.get(tenants.b(), AUDIT))).doesNotContain("Gizli");
        for (UserRole role : List.of(UserRole.EDITOR, UserRole.VIEWER, UserRole.SUPPLIER)) {
            assertThat(fixtures.get(fixtures.member(tenants.a(), role), AUDIT)).hasStatus(403);
        }
        assertThat(fixtures.get(fixtures.member(tenants.a(), UserRole.ADMIN), AUDIT)).hasStatusOk();
    }
}
