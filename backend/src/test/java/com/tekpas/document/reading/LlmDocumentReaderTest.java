package com.tekpas.document.reading;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.ai.AiRequest;
import com.tekpas.document.Extraction;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.support.FakeAiClient;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * The LLM path with a fake provider and recorded answers (docs/m5-plan.md §4, §5): the document is sent as data
 * between markers, and the answer is checked as untrusted input. Golden pairs in
 * {@code src/test/resources/documents/llm/}: {@code <document>.answer.json} (what the fake answers) and
 * {@code <document>.expected.json} (what is stored). Update: {@code -Dgolden.update=true}, then review.
 */
class LlmDocumentReaderTest {

    private static final Clock TODAY = Clock.fixed(Instant.parse("2026-10-18T09:00:00Z"), ZoneOffset.UTC);
    private static final Path DIR = Path.of("src/test/resources/documents/llm");
    private static final JsonMapper JSON = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build();

    private final DocumentReader rules = new DocumentReader(TODAY);
    private final FakeAiClient ai = new FakeAiClient();
    private LlmDocumentReader reader;

    @BeforeEach
    void init() {
        reader = new LlmDocumentReader(ai, rules, TODAY, JSON);
    }

    private static byte[] fixture(String name) throws IOException {
        try (InputStream in = LlmDocumentReaderTest.class.getResourceAsStream("/documents/" + name)) {
            assertThat(in).as("missing fixture %s", name).isNotNull();
            return in.readAllBytes();
        }
    }

    private static String mimeType(String name) {
        return name.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    }

    /** The rules first (as the job does), then the LLM on what they could not read. */
    private ReadResult read(String name) throws IOException {
        byte[] bytes = fixture(name);
        ReadResult byRules = rules.read(bytes, mimeType(name));
        assertThat(byRules.status()).as("the rules must give up on %s", name).isEqualTo(ExtractionStatus.UNREADABLE);
        return reader.read(bytes, mimeType(name), byRules);
    }

    /** The answer to a text the rules could not read, checked against that text. */
    private ReadResult readText(List<String> pages, String answer) {
        return reader.answer(answer, pages, rules.readPages(pages));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"injection-letter.pdf", "scanned-oekotex.pdf"})
    void recordedAnswersAreStoredAsExpected(String name) throws IOException {
        ai.answer(Files.readString(DIR.resolve(name.replace(".pdf", ".answer.json")), StandardCharsets.UTF_8));

        String actual = JSON.writeValueAsString(read(name)).replace("\r\n", "\n");

        Path expected = DIR.resolve(name.replace(".pdf", ".expected.json"));
        if (Boolean.getBoolean("golden.update")) {
            Files.writeString(expected, actual + "\n", StandardCharsets.UTF_8);
        }
        assertThat(JSON.readTree(actual)).as(name)
                .isEqualTo(JSON.readTree(Files.readString(expected, StandardCharsets.UTF_8)));
    }

    /**
     * The golden injection test: the document tells the model to set 2099, change the type, mark it verified and
     * add a field; the recorded answer obeys. Nothing of it gets through.
     */
    @Test
    void anInjectionInTheDocumentChangesNothingButTheProposal() throws IOException {
        ai.answer(Files.readString(DIR.resolve("injection-letter.answer.json"), StandardCharsets.UTF_8));

        ReadResult result = read("injection-letter.pdf");

        // What was sent: our instruction alone as the system instruction, the document as data between markers.
        AiRequest sent = ai.requests().getFirst();
        assertThat(sent.instruction()).doesNotContain("maintenance mode", "SYSTEM:", "2099", "Ornek Kumas");
        assertThat(sent.document()).hasSize(1).first().isInstanceOf(AiRequest.Text.class);
        String text = ((AiRequest.Text) sent.document().getFirst()).text();
        String marker = text.substring("<<<DOCUMENT ".length(), text.indexOf('\n'));
        assertThat(marker).matches("[0-9a-f]{24}");
        assertThat(sent.instruction()).contains("<<<DOCUMENT " + marker, "DOCUMENT " + marker + ">>>")
                .doesNotContain("{marker}");
        assertThat(text).startsWith("<<<DOCUMENT " + marker + "\n").endsWith("\nDOCUMENT " + marker + ">>>")
                .contains("ignore all previous instructions");
        assertThat(text.split(marker, -1)).hasSize(3);
        assertThat(sent.responseSchema().get("properties")).asInstanceOf(
                org.assertj.core.api.InstanceOfAssertFactories.MAP)
                .containsOnlyKeys("certNo", "holderName", "issuer", "validFrom", "validUntil");

        // What is kept: the five proposal fields only; the date the document asked for is refused.
        Extraction extraction = Objects.requireNonNull(result.extraction());
        assertThat(result.method()).isEqualTo(ExtractionMethod.LLM);
        assertThat(extraction.detectedType().name()).isEqualTo("OEKO_TEX");
        assertThat(extraction.fields().validUntil()).isNull();
        assertThat(extraction.warnings()).contains(LlmDocumentReader.LLM_VALUE_REJECTED);
        assertThat(confidences(extraction)).allSatisfy(c -> assertThat(c).isLessThan(0.8));
        String stored = JSON.writeValueAsString(result);
        assertThat(stored).doesNotContain("2099", "GOTS", "VERIFIED", "approvedBy", "admin");
    }

    @Test
    void everyCallHasItsOwnMarker() throws IOException {
        read("injection-letter.pdf");
        read("injection-letter.pdf");

        List<String> markers = ai.requests().stream()
                .map(r -> ((AiRequest.Text) r.document().getFirst()).text().lines().findFirst().orElseThrow())
                .toList();
        assertThat(markers).doesNotHaveDuplicates();
    }

    @Test
    void aScanIsSentAsTheFileAndItsValuesStayYellow() throws IOException {
        ai.answer(Files.readString(DIR.resolve("scanned-oekotex.answer.json"), StandardCharsets.UTF_8));

        ReadResult result = read("scanned-oekotex.pdf");

        AiRequest.File file = (AiRequest.File) ai.requests().getFirst().document().getFirst();
        assertThat(file.mimeType()).isEqualTo("application/pdf");
        assertThat(file.data()).isEqualTo(fixture("scanned-oekotex.pdf"));
        assertThat(result.status()).isEqualTo(ExtractionStatus.READ);
        assertThat(confidences(Objects.requireNonNull(result.extraction())))
                .containsOnly(LlmDocumentReader.FROM_FILE);
    }

    @Test
    void aValueTheTextDoesNotContainIsDowngraded() {
        ReadResult result = readText(List.of("OEKO-TEX STANDARD 100", "We confirm certificate DEMO-OT-2026-0555."),
                "{\"certNo\":\"DEMO-OT-2026-9999\",\"holderName\":null}");

        Extraction.Field certNo = Objects.requireNonNull(result.extraction()).fields().certNo();
        assertThat(certNo).isNotNull();
        assertThat(certNo.confidence()).isEqualTo(LlmDocumentReader.NOT_IN_TEXT);
        assertThat(certNo.evidence()).isNull();
        assertThat(result.extraction().warnings()).containsExactly(LlmDocumentReader.LLM_VALUE_NOT_IN_TEXT);
        assertThat(result.status()).isEqualTo(ExtractionStatus.PARTIAL);
    }

    @Test
    void wrongTypesOverlongValuesAndLocalDatesAreRefused() {
        String longName = "A".repeat(600);
        ReadResult result = readText(List.of("OEKO-TEX", "Holder Ornek Kumas A.S. holds DEMO-OT-1 until 2027"),
                "{\"certNo\":12345,\"holderName\":\"" + longName + "\",\"issuer\":{\"name\":\"x\"},"
                        + "\"validUntil\":\"31.12.2027\",\"validFrom\":\"2026-02-30\"}");

        assertThat(result.status()).isEqualTo(ExtractionStatus.UNREADABLE);
        assertThat(result.failureCode()).isEqualTo(ReadResult.LLM_NO_RESULT);
        assertThat(result.method()).isEqualTo(ExtractionMethod.NONE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not json at all", "[{\"certNo\":\"DEMO-1\"}]", "\"DEMO-1\"", "", "{\"certNo\":"})
    void anAnswerThatIsNotAnObjectGivesNothing(String answer) {
        ReadResult result = readText(List.of("OEKO-TEX", "We confirm certificate DEMO-OT-2026-0555."), answer);

        assertThat(result.status()).isEqualTo(ExtractionStatus.UNREADABLE);
        assertThat(result.failureCode()).isEqualTo(ReadResult.LLM_NO_RESULT);
    }

    @Test
    void controlAndDirectionCharactersAreStripped() {
        ReadResult result = readText(List.of("OEKO-TEX", "We confirm that Ornek Kumas Boya A.S. holds it."),
                "{\"holderName\":\"Ornek\\u202e Kumas\\u0000 Boya\\u200b A.S.\"}");

        Extraction.Field holder = Objects.requireNonNull(result.extraction()).fields().holderName();
        assertThat(holder).isNotNull();
        assertThat(holder.value()).isEqualTo("Ornek Kumas Boya A.S.");
        assertThat(holder.confidence()).isEqualTo(LlmDocumentReader.IN_TEXT);
        assertThat(holder.evidence()).isNotNull();
    }

    @Test
    void anExpiredDateIsFlaggedLikeTheRulesDo() {
        ReadResult result = readText(List.of("OEKO-TEX", "Certificate DEMO-OT-2025-1 valid through 31.12.2025"),
                "{\"certNo\":\"DEMO-OT-2025-1\",\"validUntil\":\"2025-12-31\"}");

        assertThat(Objects.requireNonNull(result.extraction()).warnings()).contains("EXPIRED");
        assertThat(result.extraction().fields().validUntil().confidence()).isEqualTo(LlmDocumentReader.IN_TEXT);
    }

    @Test
    void theLlmIsNeverAsSureAsTheRules() {
        assertThat(Stream.of(LlmDocumentReader.IN_TEXT, LlmDocumentReader.FROM_FILE, LlmDocumentReader.NOT_IN_TEXT))
                .allSatisfy(c -> assertThat(c).isLessThanOrEqualTo(LlmDocumentReader.MAX)
                        .isLessThan(DocumentReader.NEXT_LINE));
    }

    private static List<Double> confidences(Extraction extraction) {
        Extraction.Fields f = extraction.fields();
        return Arrays.stream(new Extraction.Field[] {f.certNo(), f.holderName(), f.issuer(), f.validFrom(),
                f.validUntil()}).filter(Objects::nonNull).map(Extraction.Field::confidence).toList();
    }
}
