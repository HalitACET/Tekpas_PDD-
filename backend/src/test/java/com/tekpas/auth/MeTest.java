package com.tekpas.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestFixtures.TenantPair;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.JsonNode;

@IntegrationTest
class MeTest {

    @Autowired
    TestFixtures fixtures;

    @Test
    void eachUserSeesTheirOwnCompany() {
        TenantPair tenants = fixtures.twoTenants();

        assertMeMatches(tenants.a());
        assertMeMatches(tenants.b());
    }

    private void assertMeMatches(Tenant tenant) {
        MvcTestResult result = fixtures.mvc().get().uri("/api/v1/auth/me")
                .header(HttpHeaders.AUTHORIZATION, tenant.bearer())
                .exchange();

        assertThat(result).hasStatusOk();
        JsonNode body = fixtures.body(result);
        assertThat(body.path("id").asString()).isEqualTo(tenant.user().getId().toString());
        assertThat(body.path("email").asString()).isEqualTo(tenant.user().getEmail());
        assertThat(body.path("role").asString()).isEqualTo("OWNER");
        assertThat(body.path("company").path("id").asString()).isEqualTo(tenant.company().getId().toString());
        assertThat(body.path("company").path("name").asString()).isEqualTo(tenant.company().getName());
        assertThat(body.path("company").path("type").asString()).isEqualTo("MANUFACTURER");
    }
}
