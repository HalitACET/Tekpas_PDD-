package com.tekpas;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes the API contract to {@code packages/api-client/openapi.json}, from which the TypeScript client
 * is generated ({@code pnpm --filter api-client generate}). The output is deterministic: keys sorted,
 * no host/port, LF line endings. CI regenerates it and fails if the committed copy differs.
 */
@IntegrationTest
class OpenApiExportTest {

    private static final Path TARGET = Path.of("packages", "api-client", "openapi.json");

    private final JsonMapper canonical = JsonMapper.builder()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .build();

    @Autowired
    TestFixtures fixtures;

    @Test
    void exportsDeterministicOpenApiSpec() throws Exception {
        String first = canonicalSpec();
        String second = canonicalSpec();
        assertThat(second).isEqualTo(first);

        assertThat(first).contains("\"getMe\"", "\"MeResponse\"", "\"LoginRequest\"",
                "\"ApiProblem\"");
        assertThat(first).doesNotContain("\"servers\"", "\r");

        Files.writeString(repoRoot().resolve(TARGET), first, StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private String canonicalSpec() {
        String raw = new String(fixtures.mvc().get().uri("/v3/api-docs").exchange()
                .getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        Map<String, Object> spec = canonical.readValue(raw, Map.class);
        spec.remove("servers"); // host and port of the test server
        return canonical.writeValueAsString(spec).replace("\r\n", "\n") + "\n";
    }

    /** Maven runs tests in backend/, an IDE may not: find the directory that holds packages/api-client. */
    private static Path repoRoot() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            if (Files.isRegularFile(dir.resolve("packages/api-client/package.json"))) {
                return dir;
            }
        }
        throw new IllegalStateException("packages/api-client not found above " + Path.of("").toAbsolutePath());
    }
}
