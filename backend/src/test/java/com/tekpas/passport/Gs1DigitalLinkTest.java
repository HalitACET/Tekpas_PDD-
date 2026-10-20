package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Cases come from packages/shared/test-vectors/gs1-digital-link.json, which the TypeScript twin is tested against too. */
class Gs1DigitalLinkTest {

    static final JsonNode VECTORS = load();

    static Stream<JsonNode> cases(String name) {
        return VECTORS.path(name).valueStream();
    }

    @Test
    void buildsTheCanonicalPath() {
        assertThat(cases("valid")).isNotEmpty().allSatisfy(c -> {
            assertThat(Gs1DigitalLink.path(c.path("gtin").asString(), c.path("batchNo").asString()))
                    .as(c.path("note").asString()).isEqualTo(c.path("path").asString());
            assertThat(Gs1DigitalLink.url("https://kozapass.vercel.app/", c.path("gtin").asString(),
                    c.path("batchNo").asString())).isEqualTo("https://kozapass.vercel.app" + c.path("path").asString());
        });
    }

    @Test
    void refusesWhatIsNotAValidGtinOrBatchNumber() {
        assertThat(cases("invalidPath")).isNotEmpty().allSatisfy(c -> assertThatThrownBy(
                () -> Gs1DigitalLink.path(c.path("gtin").asString(), c.path("batchNo").asString()))
                .as(c.path("note").asString()).isInstanceOf(IllegalArgumentException.class));
    }

    @Test
    void readsAScannedAddress() {
        assertThat(cases("parse")).isNotEmpty().allSatisfy(c -> assertThat(
                Gs1DigitalLink.parse(c.path("gtin").asString(), c.path("batchNo").asString()))
                .as(c.path("note").asString())
                .contains(new Gs1DigitalLink.Key(c.path("gtin14").asString(), c.path("batch").asString())));
    }

    @Test
    void anUnreadableCodeIsNotACode() {
        assertThat(cases("unreadable")).isNotEmpty().allSatisfy(c -> assertThat(
                Gs1DigitalLink.parse(c.path("gtin").asString(), c.path("batchNo").asString()))
                .as(c.path("note").asString()).isEmpty());
    }

    private static JsonNode load() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("packages/shared/test-vectors/gs1-digital-link.json");
            if (Files.exists(file)) {
                try {
                    return JsonMapper.builder().build().readTree(Files.readString(file));
                } catch (IOException e) {
                    throw new IllegalStateException(e);
                }
            }
        }
        throw new IllegalStateException("packages/shared/test-vectors/gs1-digital-link.json not found");
    }
}
