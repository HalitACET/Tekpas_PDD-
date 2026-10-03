package com.tekpas.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Cases come from packages/shared/test-vectors/gtin.json, which the TypeScript rule is tested against too. */
class GtinTest {

    private static final JsonNode VECTORS = readVectors();

    static Stream<JsonNode> valid() {
        return VECTORS.path("valid").valueStream();
    }

    static Stream<String> invalidCheckDigit() {
        return VECTORS.path("invalidCheckDigit").valueStream().map(JsonNode::asString);
    }

    static Stream<String> invalidFormat() {
        return VECTORS.path("invalidFormat").valueStream().map(JsonNode::asString);
    }

    @ParameterizedTest
    @MethodSource("valid")
    void realGtinsPassAndNormalizeTo14Digits(JsonNode gtin) {
        String input = gtin.path("input").asString();

        assertThat(Gtin.hasAcceptedFormat(input)).isTrue();
        assertThat(Gtin.hasValidCheckDigit(input)).isTrue();
        assertThat(Gtin.normalize(input)).isEqualTo(gtin.path("normalized").asString()).hasSize(14);
        assertThat(Gtin.hasValidCheckDigit(Gtin.normalize(input))).isTrue();
    }

    @ParameterizedTest
    @MethodSource("valid")
    void changingAnySingleDigitBreaksTheCheckDigit(JsonNode gtin) {
        String input = gtin.path("input").asString();
        for (String changed : singleDigitChanges(input)) {
            assertThat(Gtin.hasValidCheckDigit(changed)).as(changed).isFalse();
        }
    }

    @ParameterizedTest
    @MethodSource("invalidCheckDigit")
    void wrongCheckDigitFails(String input) {
        assertThat(Gtin.hasAcceptedFormat(input)).isTrue();
        assertThat(Gtin.hasValidCheckDigit(input)).isFalse();
    }

    @ParameterizedTest
    @MethodSource("invalidFormat")
    void otherLengthsAndCharactersAreNotAccepted(String input) {
        assertThat(Gtin.hasAcceptedFormat(input)).isFalse();
        assertThatThrownBy(() -> Gtin.normalize(input)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void checkDigitOfKnownBodies() {
        assertThat(Gtin.checkDigit("400638133393")).isEqualTo(1);
        assertThat(Gtin.checkDigit("0201234500001")).isEqualTo(8);
        assertThat(Gtin.checkDigit("9638507")).isEqualTo(4);
    }

    /** Every variant with exactly one digit replaced by another digit (9 per position). */
    static List<String> singleDigitChanges(String gtin) {
        return Stream.iterate(0, i -> i < gtin.length(), i -> i + 1)
                .flatMap(i -> Stream.iterate(1, d -> d < 10, d -> d + 1)
                        .map(d -> gtin.substring(0, i) + (char) ('0' + (gtin.charAt(i) - '0' + d) % 10)
                                + gtin.substring(i + 1)))
                .toList();
    }

    private static JsonNode readVectors() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path file = dir.resolve("packages/shared/test-vectors/gtin.json");
            if (Files.isRegularFile(file)) {
                try {
                    return JsonMapper.builder().build().readTree(Files.readString(file));
                } catch (IOException e) {
                    throw new IllegalStateException(e);
                }
            }
        }
        throw new IllegalStateException("packages/shared/test-vectors/gtin.json not found");
    }
}
