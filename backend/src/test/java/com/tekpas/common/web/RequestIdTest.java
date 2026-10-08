package com.tekpas.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.company.UserRole;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import com.tekpas.support.TestGtins;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

@IntegrationTest
@ExtendWith(OutputCaptureExtension.class)
class RequestIdTest {

    static final String SHAPE = "^[a-f0-9]{4}-[a-f0-9]{4}$";

    @Autowired
    TestFixtures fixtures;

    static String header(MvcTestResult result) {
        return result.getResponse().getHeader(RequestId.HEADER);
    }

    @Test
    void everyResponseCarriesAFreshId() {
        Tenant tenant = fixtures.tenant();

        MvcTestResult ok = fixtures.get(tenant, "/api/v1/products");
        MvcTestResult again = fixtures.get(tenant, "/api/v1/products");
        MvcTestResult health = fixtures.mvc().get().uri("/actuator/health/liveness").exchange();

        assertThat(ok).hasStatusOk();
        assertThat(header(ok)).matches(SHAPE);
        assertThat(header(again)).matches(SHAPE).isNotEqualTo(header(ok));
        assertThat(header(health)).matches(SHAPE);
    }

    @Test
    void errorBodiesNameTheSameIdAsTheHeader() {
        Tenant tenant = fixtures.tenant();
        Tenant supplier = fixtures.member(tenant, UserRole.SUPPLIER);

        MvcTestResult notFound = fixtures.get(tenant, "/api/v1/products/" + UUID.randomUUID());
        MvcTestResult invalid = fixtures.post(tenant, "/api/v1/products", Map.of("name", ""));
        MvcTestResult unreadable = fixtures.post(tenant, "/api/v1/products", "{");
        MvcTestResult forbidden = fixtures.get(supplier, "/api/v1/products");
        MvcTestResult unauthorized = fixtures.mvc().get().uri("/api/v1/products").exchange();
        MvcTestResult badToken = fixtures.mvc().get().uri("/api/v1/products")
                .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-token").exchange();
        MvcTestResult noRoute = fixtures.get(tenant, "/api/v1/no-such-thing");

        for (MvcTestResult result : new MvcTestResult[] {notFound, invalid, unreadable, forbidden, unauthorized,
                badToken, noRoute}) {
            assertThat(result.getResponse().getStatus()).isGreaterThanOrEqualTo(400);
            assertThat(header(result)).matches(SHAPE);
            assertThat(fixtures.body(result).path("requestId").asString())
                    .as("%s %s", result.getResponse().getStatus(), fixtures.responseText(result))
                    .isEqualTo(header(result));
        }
    }

    @Test
    void aWellFormedCallerIdIsKept() {
        String id = UUID.randomUUID().toString();

        MvcTestResult result = fixtures.mvc().get().uri("/api/v1/products").header(RequestId.HEADER, id).exchange();

        assertThat(header(result)).isEqualTo(id);
        assertThat(fixtures.body(result).path("requestId").asString()).isEqualTo(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc", "ABCDEF12", "ab12-cd34\nFAKE LOG LINE", "ab12 cd34", "<script>alert(1)</script>",
            "0123456789abcdef0123456789abcdef0123456789"})
    void anyOtherCallerIdIsReplaced(String forged) {
        MvcTestResult result = fixtures.mvc().get().uri("/api/v1/products").header(RequestId.HEADER, forged).exchange();

        assertThat(header(result)).matches(SHAPE).isNotEqualTo(forged);
        assertThat(fixtures.body(result).path("requestId").asString()).isEqualTo(header(result));
    }

    @Test
    void logLinesOfARequestCarryItsId(CapturedOutput output) {
        Tenant tenant = fixtures.tenant();
        String gtin = TestGtins.gtin13();
        Map<String, Object> product = Map.of("gtin", gtin, "name", "Ürün", "category", "T_SHIRT");
        assertThat(fixtures.post(tenant, "/api/v1/products", product)).hasStatus(201);

        // The unique key violation is logged by Hibernate while the request is served.
        MvcTestResult conflict = fixtures.mvc().post().uri("/api/v1/products")
                .header(HttpHeaders.AUTHORIZATION, tenant.bearer()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"gtin\":\"" + gtin + "\",\"name\":\"Ürün\",\"category\":\"T_SHIRT\"}").exchange();

        assertThat(conflict).hasStatus(409);
        assertThat(output.getOut()).containsPattern("\\[" + header(conflict) + "\\] .*product_gtin_key");
    }
}
