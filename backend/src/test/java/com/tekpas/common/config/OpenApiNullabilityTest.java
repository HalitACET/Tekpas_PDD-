package com.tekpas.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** DTO record components are required in the OpenAPI schema unless annotated @Nullable. */
@IntegrationTest
class OpenApiNullabilityTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    JsonMapper json;

    @Test
    void meResponseFieldsAreAllRequired() {
        assertThat(required("MeResponse"))
                .containsExactlyInAnyOrder("id", "email", "fullName", "role", "locale", "company");
    }

    @Test
    void nullableFieldsAreNotRequired() {
        assertThat(required("LoginResponse"))
                .containsExactlyInAnyOrder("accessToken", "tokenType", "expiresIn", "user")
                .doesNotContain("refreshToken");
        assertThat(required("TokenResponse")).doesNotContain("refreshToken");
        assertThat(required("ApiProblem"))
                .containsExactlyInAnyOrder("type", "title", "status")
                .doesNotContain("detail", "instance", "errors");
        assertThat(required("FieldViolation")).containsExactlyInAnyOrder("field", "code");
    }

    @Test
    void nestedAndRequestSchemasFollowTheSameRule() {
        assertThat(required("CompanySummary")).containsExactlyInAnyOrder("id", "name", "type");
        assertThat(required("LoginRequest")).containsExactlyInAnyOrder("email", "password", "client")
                .doesNotContain("rememberMe");
    }

    @Test
    void genericPageRecordsAreRequiredToo() {
        assertThat(required("PageResponseProductListItem"))
                .containsExactlyInAnyOrder("content", "page", "size", "totalElements", "totalPages");
        assertThat(required("PageResponseBatchResponse"))
                .containsExactlyInAnyOrder("content", "page", "size", "totalElements", "totalPages");
    }

    @Test
    void nullableFieldsAcceptJsonNull() {
        assertThat(types("ProductUpdateRequest", "sku")).containsExactly("string", "null");
        assertThat(types("ProductUpdateRequest", "declaredFiberComposition")).containsExactly("array", "null");
        assertThat(types("ProductResponse", "description")).containsExactly("string", "null");
        assertThat(types("BatchUpdateRequest", "producedTo")).containsExactly("string", "null");
        assertThat(types("ProductResponse", "name")).containsExactly("string");
        assertThat(required("ProductUpdateRequest")).isEmpty();
        assertThat(required("ProductResponse")).contains("id", "gtin", "name", "category", "batchCount")
                .doesNotContain("sku", "description", "declaredFiberComposition");
    }

    private List<String> types(String schema, String property) {
        JsonNode node = schemaNode(schema).path("properties").path(property).path("type");
        return node.isArray() ? node.valueStream().map(JsonNode::asString).toList() : List.of(node.asString());
    }

    private JsonNode schemaNode(String schema) {
        String spec = new String(fixtures.mvc().get().uri("/v3/api-docs").exchange()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        JsonNode node = json.readTree(spec).path("components").path("schemas").path(schema);
        assertThat(node.isMissingNode()).as("schema %s exists", schema).isFalse();
        return node;
    }

    private List<String> required(String schema) {
        String spec = new String(fixtures.mvc().get().uri("/v3/api-docs").exchange()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        JsonNode node = json.readTree(spec).path("components").path("schemas").path(schema);
        assertThat(node.isMissingNode()).as("schema %s exists", schema).isFalse();
        return node.path("required").valueStream().map(JsonNode::asString).toList();
    }
}
