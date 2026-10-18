package com.tekpas.document.reading;

import com.tekpas.ai.AiClient;
import com.tekpas.ai.AiException;
import com.tekpas.ai.AiRequest;
import com.tekpas.document.DocType;
import com.tekpas.document.Extraction;
import com.tekpas.document.Extraction.Evidence;
import com.tekpas.document.Extraction.Field;
import com.tekpas.document.Extraction.FieldSource;
import com.tekpas.document.Extraction.Fields;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.document.reading.CertificateRules.Key;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The last resort for what the rules could not read (docs/m5-plan.md §3, step 4): the text of a PDF whose labels
 * the rules do not know, or the file itself when it has no text layer (a scan, a photo). Only called behind the
 * {@code LlmGate}.
 *
 * <p><b>The document is data, not instructions.</b> Our instruction ({@code prompts/certificate-reading.md}) goes
 * as the system instruction; the document goes as the user's turn, its text between markers carrying a random
 * value it cannot guess. There are no tools. The answer must follow a five-field schema, and is then checked here
 * as untrusted input: only those five fields are read (anything else is dropped), each must be a string that passes
 * the same checks as the rules' values, dates must be ISO and plausible. The document's own type, its review status
 * and the real fields are not touched; the result is a proposal like the rules' (CLAUDE.md rule 5).
 *
 * <p><b>Confidence</b> is ours, never the model's, and always below the rules' and below 0.8 (yellow, a person must
 * look): 0.75 for a value found on a line of the PDF's text, 0.6 for a value read from a file we cannot check, 0.4
 * for a value the text does not contain (with the warning {@code LLM_VALUE_NOT_IN_TEXT}).
 */
@Component
public class LlmDocumentReader {

    static final double IN_TEXT = 0.75;
    static final double FROM_FILE = 0.6;
    static final double NOT_IN_TEXT = 0.4;
    /** No LLM value ever reaches green (0.8). */
    static final double MAX = 0.79;
    /** Characters of text sent at most (20 pages of a certificate are far below). */
    static final int MAX_TEXT = 40_000;
    static final int MAX_VALUE = 500;
    static final int YEARS_BACK = 30;
    static final int YEARS_AHEAD = 10;
    static final String PROMPT = "prompts/certificate-reading.md";

    public static final String LLM_VALUE_NOT_IN_TEXT = "LLM_VALUE_NOT_IN_TEXT";
    public static final String LLM_VALUE_REJECTED = "LLM_VALUE_REJECTED";

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<String, Key> FIELDS = fields();
    private static final Map<String, Object> SCHEMA = schema();

    private final AiClient ai;
    private final DocumentReader rules;
    private final Clock clock;
    private final ObjectMapper json;
    private final String instruction;

    public LlmDocumentReader(AiClient ai, DocumentReader rules, Clock clock, ObjectMapper json) {
        this.ai = ai;
        this.rules = rules;
        this.clock = clock;
        this.json = json;
        this.instruction = loadPrompt();
    }

    public String model() {
        return ai.model();
    }

    /**
     * Reads the document the rules gave up on ({@code byRules} is UNREADABLE).
     *
     * @return READ or PARTIAL by the LLM, or UNREADABLE ({@code LLM_NO_RESULT}) when its answer holds nothing usable
     * @throws AiException when the LLM gives no answer (the caller decides: retry or manual entry)
     * @throws IOException when the PDF's text cannot be taken (the rules already read it once)
     */
    public ReadResult read(byte[] bytes, String mimeType, ReadResult byRules) throws IOException {
        String marker = HexFormat.of().formatHex(nonce());
        List<String> pages = null;
        AiRequest.Part part;
        if (ReadResult.NO_KNOWN_FIELDS.equals(byRules.failureCode()) && "application/pdf".equals(mimeType)) {
            pages = PdfText.pages(bytes).stream().map(p -> Normalizer.normalize(p, Normalizer.Form.NFC)).toList();
            part = new AiRequest.Text(enclose(String.join("\n\n", pages), marker));
        } else {
            part = new AiRequest.File(mimeType, bytes);
        }
        String answer = ai.generateJson(new AiRequest(instruction.replace("{marker}", marker), List.of(part), SCHEMA));
        return answer(answer, pages, byRules);
    }

    /** The untrusted text between markers it cannot close: the marker is random for every call. */
    static String enclose(String text, String marker) {
        String body = text.length() <= MAX_TEXT ? text : text.substring(0, MAX_TEXT);
        return "<<<DOCUMENT " + marker + "\n" + body + "\nDOCUMENT " + marker + ">>>";
    }

    /** The model's answer, checked like any outside input. */
    ReadResult answer(String raw, @Nullable List<String> pages, ReadResult byRules) {
        JsonNode root;
        try {
            root = json.readTree(raw);
        } catch (JacksonException e) {
            return noResult(byRules);
        }
        if (root == null || !root.isObject()) {
            return noResult(byRules);
        }
        Map<Key, Field> found = new EnumMap<>(Key.class);
        List<String> warnings = new ArrayList<>();
        boolean rejected = false;
        boolean notInText = false;
        for (Map.Entry<String, Key> entry : FIELDS.entrySet()) {
            JsonNode node = root.get(entry.getKey());
            if (node == null || node.isNull()) {
                continue;
            }
            String value = node.isString() ? valid(entry.getValue(), node.asString()) : null;
            if (value == null) {
                rejected = rejected || !(node.isString() && clean(node.asString()).isEmpty());
                continue;
            }
            Field field = locate(entry.getValue(), value, pages);
            notInText = notInText || field.confidence() == NOT_IN_TEXT;
            found.put(entry.getValue(), field);
        }
        if (rejected) {
            warnings.add(LLM_VALUE_REJECTED);
        }
        if (notInText) {
            warnings.add(LLM_VALUE_NOT_IN_TEXT);
        }
        if (found.isEmpty()) {
            return noResult(byRules);
        }
        rules.checkDates(found, warnings);
        Fields fields = new Fields(found.get(Key.CERT_NO), found.get(Key.HOLDER), found.get(Key.ISSUER),
                found.get(Key.VALID_FROM), found.get(Key.VALID_UNTIL));
        // The type stays what the rules saw (UNKNOWN for a scan): the LLM cannot change it.
        DocType type = byRules.extraction() == null ? DocType.UNKNOWN : byRules.extraction().detectedType();
        boolean complete = fields.certNo() != null && fields.holderName() != null && fields.validUntil() != null;
        return new ReadResult(complete ? ExtractionStatus.READ : ExtractionStatus.PARTIAL, ExtractionMethod.LLM, null,
                new Extraction(type, ExtractionMethod.LLM, fields, warnings));
    }

    private static ReadResult noResult(ReadResult byRules) {
        return byRules.unreadable(ReadResult.LLM_NO_RESULT);
    }

    /** The value if it passes the field's checks, otherwise null. */
    private @Nullable String valid(Key key, String raw) {
        if (raw.length() > MAX_VALUE) {
            return null;
        }
        String value = clean(raw);
        if (value.isEmpty()) {
            return null;
        }
        return switch (key) {
            case CERT_NO -> {
                String number = value.replaceAll("[.,;]+$", "").strip();
                yield DocumentReader.plausibleCertNo(number) ? number : null;
            }
            case HOLDER, ISSUER -> DocumentReader.plausibleName(value) ? value : null;
            case VALID_FROM, VALID_UNTIL -> plausibleDate(value);
            case VALIDITY -> null;
        };
    }

    /** ISO only (the schema asks for it), and within a range a certificate can have. */
    private @Nullable String plausibleDate(String value) {
        LocalDate date;
        try {
            date = LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            return null;
        }
        int year = LocalDate.ofInstant(clock.instant(), ISTANBUL).getYear();
        return date.getYear() >= year - YEARS_BACK && date.getYear() <= year + YEARS_AHEAD ? date.toString() : null;
    }

    /** Where in the text the value is, which sets its confidence; a file cannot be checked. */
    private static Field locate(Key key, String value, @Nullable List<String> pages) {
        if (pages == null) {
            return new Field(value, FROM_FILE, FieldSource.LLM, null);
        }
        boolean date = key == Key.VALID_FROM || key == Key.VALID_UNTIL;
        String wanted = squash(Folding.fold(value));
        for (int p = 0; p < pages.size(); p++) {
            for (String line : pages.get(p).split("\\R")) {
                boolean hit = date ? Dates.all(line).contains(LocalDate.parse(value))
                        : squash(Folding.fold(line)).contains(wanted);
                if (hit) {
                    return new Field(value, Math.min(IN_TEXT, MAX), FieldSource.LLM,
                            new Evidence(p + 1, DocumentReader.snippet(line)));
                }
            }
        }
        return new Field(value, NOT_IN_TEXT, FieldSource.LLM, null);
    }

    /** Composed form, no control or format characters (bidi overrides, zero-width), single spaces. */
    static String clean(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cc}\\p{Cf}&&[^\\t\\n\\r]]", "")
                .replaceAll("\\s+", " ")
                .strip();
    }

    private static String squash(String text) {
        return text.replaceAll("\\s+", " ").strip();
    }

    private static byte[] nonce() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    private static Map<String, Key> fields() {
        Map<String, Key> fields = new LinkedHashMap<>();
        fields.put("certNo", Key.CERT_NO);
        fields.put("holderName", Key.HOLDER);
        fields.put("issuer", Key.ISSUER);
        fields.put("validFrom", Key.VALID_FROM);
        fields.put("validUntil", Key.VALID_UNTIL);
        return fields;
    }

    /** Five nullable strings, all required, nothing else (Gemini's OpenAPI subset). */
    private static Map<String, Object> schema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("certNo", string("Certificate, licence or scope certificate number, as printed"));
        properties.put("holderName", string("Company the certificate is issued to, as printed"));
        properties.put("issuer", string("Certification body that issued it, as printed"));
        properties.put("validFrom", string("Start of validity or date of issue, YYYY-MM-DD"));
        properties.put("validUntil", string("End of validity or expiry date, YYYY-MM-DD"));
        return Map.of("type", "OBJECT", "properties", properties, "required", List.copyOf(properties.keySet()),
                "propertyOrdering", List.copyOf(properties.keySet()));
    }

    private static Map<String, Object> string(String description) {
        return Map.of("type", "STRING", "nullable", true, "description", description);
    }

    private static String loadPrompt() {
        try (InputStream in = new ClassPathResource(PROMPT).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Prompt " + PROMPT + " is missing", e);
        }
    }
}
