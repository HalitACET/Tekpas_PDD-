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

    private List<String> required(String schema) {
        String spec = new String(fixtures.mvc().get().uri("/v3/api-docs").exchange()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        JsonNode node = json.readTree(spec).path("components").path("schemas").path(schema);
        assertThat(node.isMissingNode()).as("schema %s exists", schema).isFalse();
        return node.path("required").valueStream().map(JsonNode::asString).toList();
    }
}
