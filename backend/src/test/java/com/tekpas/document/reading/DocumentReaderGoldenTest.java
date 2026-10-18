package com.tekpas.document.reading;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Golden tests of the reader (docs/m5-plan.md §5): every synthetic document in {@code src/test/resources/documents/}
 * is read and the result compared field by field with its {@code .expected.json} (status, type, values, confidence,
 * evidence, warnings). A change in what the rules read shows up here as a diff to review.
 *
 * <p>After an intended change: {@code ./mvnw test -Dtest=DocumentReaderGoldenTest -Dgolden.update=true}, then read
 * the changed golden files before committing them.
 */
class DocumentReaderGoldenTest {

    /** The day the expected files were written: EXPIRED depends on it. */
    private static final Clock TODAY = Clock.fixed(Instant.parse("2026-10-18T09:00:00Z"), ZoneOffset.UTC);
    private static final Path DIR = Path.of("src/test/resources/documents");
    private static final JsonMapper JSON = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build();

    private final DocumentReader reader = new DocumentReader(TODAY);

    static Stream<String> documents() {
        return DemoCertificates.ALL.keySet().stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("documents")
    void readsAsExpected(String name) throws IOException {
        byte[] bytes;
        try (InputStream in = getClass().getResourceAsStream("/documents/" + name)) {
            assertThat(in).as("missing fixture %s: run DemoCertificates.main", name).isNotNull();
            bytes = in.readAllBytes();
        }
        String mimeType = name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";

        String actual = JSON.writeValueAsString(reader.read(bytes, mimeType));

        Path expected = DIR.resolve(name + ".expected.json");
        if (Boolean.getBoolean("golden.update")) {
            Files.writeString(expected, actual + "\n", StandardCharsets.UTF_8);
        }
        assertThat(Files.exists(expected)).as("missing golden file %s", expected).isTrue();
        JsonNode want = JSON.readTree(Files.readString(expected, StandardCharsets.UTF_8));
        assertThat(JSON.readTree(actual)).as(name).isEqualTo(want);
    }
}
