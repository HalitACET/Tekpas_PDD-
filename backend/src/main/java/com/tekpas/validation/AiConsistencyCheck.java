package com.tekpas.validation;

import com.tekpas.ai.AiClient;
import com.tekpas.ai.AiException;
import com.tekpas.ai.AiRequest;
import com.tekpas.document.DocType;
import com.tekpas.document.DocumentText;
import com.tekpas.document.reading.Folding;
import com.tekpas.supplychain.StepType;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The AI checks of a batch (docs/m7-plan.md §8): {@code AI-01} a certificate's scope may not cover the step or the
 * product, {@code AI-02} two declarations may contradict each other. Only reached behind the {@code LlmGate}
 * (CLAUDE.md rule 4) and only as suggestions (rule 5): WARNING at most, never blocking.
 *
 * <p><b>The data is data, not instructions.</b> Our instruction ({@code prompts/consistency-check.md}) goes as the
 * system instruction; the batch's data sheet goes as the user's turn between markers carrying a random value. There
 * are no tools, and the answer follows a schema. The answer is then checked as untrusted input: only the two codes,
 * only references the sheet has, and every quote must be found in the source it names. A suggestion that cannot be
 * tied to the data is dropped, so a model that invents (or a document that tries to steer it) shows nothing.
 *
 * <p><b>Confidence</b> is ours, never the model's, and below 0.8 like every LLM value: 0.7 when every quote is in its
 * source as it is, 0.6 when only after case, accents and spacing are ignored.
 */
@Component
public class AiConsistencyCheck {

    static final double EXACT = 0.7;
    static final double LOOSE = 0.6;
    static final int MAX_FINDINGS = 5;
    static final int MAX_QUOTE = 200;
    static final int MIN_QUOTE = 2;
    static final String PROMPT = "prompts/consistency-check.md";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Map<String, Object> SCHEMA = schema();

    /** One source of the sheet: "P", "S1", "D1". */
    public record Source(String ref, IssueEvidence.Source kind, @Nullable UUID stepId, @Nullable UUID documentId,
            @Nullable StepType stepType, @Nullable DocType docType, @Nullable String supplier, String text) {
    }

    /** What the check reads: the sources in sheet order and the product category (part of AI-01's identity). */
    public record Sheet(List<Source> sources, String productCategory) {

        /** The text sent, without the markers: its digest says whether anything changed since the last answer. */
        public String body() {
            StringBuilder out = new StringBuilder();
            for (Source source : sources) {
                out.append(source.ref()).append(": ").append(source.text()).append("\n\n");
            }
            return out.toString().strip();
        }
    }

    private final AiClient ai;
    private final ObjectMapper json;
    private final String instruction;

    public AiConsistencyCheck(AiClient ai, ObjectMapper json) {
        this.ai = ai;
        this.json = json;
        this.instruction = loadPrompt();
    }

    /** The model that answers: part of the digest, so another model looks at the same data again. */
    public String model() {
        return ai.model();
    }

    /**
     * Asks the LLM and keeps what can be tied to the sheet.
     *
     * @throws AiException when the LLM gives no answer (the caller decides: retry or give up)
     */
    public List<Finding> check(Sheet sheet) {
        String marker = HexFormat.of().formatHex(nonce());
        String data = "<<<DATA " + marker + "\n" + sheet.body() + "\nDATA " + marker + ">>>";
        String answer = ai.generateJson(new AiRequest(instruction.replace("{marker}", marker),
                List.of(new AiRequest.Text(data)), SCHEMA));
        return answer(answer, sheet);
    }

    /** The model's answer, checked like any outside input. */
    List<Finding> answer(String raw, Sheet sheet) {
        JsonNode root;
        try {
            root = json.readTree(raw);
        } catch (JacksonException e) {
            return List.of();
        }
        JsonNode list = root == null ? null : root.get("findings");
        if (list == null || !list.isArray()) {
            return List.of();
        }
        Map<String, Source> byRef = new LinkedHashMap<>();
        sheet.sources().forEach(s -> byRef.put(s.ref(), s));
        Map<String, Finding> kept = new LinkedHashMap<>();
        for (JsonNode node : list) {
            if (kept.size() == MAX_FINDINGS) {
                break;
            }
            Finding finding = finding(node, byRef, sheet.productCategory());
            if (finding != null) {
                kept.putIfAbsent(finding.fingerprint(), finding);
            }
        }
        return List.copyOf(kept.values());
    }

    private @Nullable Finding finding(JsonNode node, Map<String, Source> byRef, String category) {
        if (node == null || !node.isObject() || node.get("code") == null || !node.get("code").isString()) {
            return null;
        }
        IssueCode code = switch (node.get("code").asString()) {
            case "AI-01" -> IssueCode.AI_01;
            case "AI-02" -> IssueCode.AI_02;
            default -> null;
        };
        JsonNode evidence = node.get("evidence");
        if (code == null || evidence == null || !evidence.isArray()) {
            return null;
        }
        List<Source> sources = new ArrayList<>();
        List<IssueEvidence> quotes = new ArrayList<>();
        boolean exact = true;
        for (JsonNode item : evidence) {
            if (quotes.size() == 2) {
                break;
            }
            Source source = item != null && item.get("ref") != null && item.get("ref").isString()
                    ? byRef.get(item.get("ref").asString()) : null;
            String quote = item != null && item.get("quote") != null && item.get("quote").isString()
                    ? quote(item.get("quote").asString()) : null;
            if (source == null || quote == null || sources.contains(source)) {
                continue;
            }
            Match match = match(quote, source.text());
            if (match == Match.NONE) {
                continue;
            }
            exact = exact && match == Match.EXACT;
            sources.add(source);
            quotes.add(new IssueEvidence(source.kind(), source.stepType(), source.docType(), source.supplier(), quote));
        }
        double confidence = exact ? EXACT : LOOSE;
        if (code == IssueCode.AI_01) {
            // The scope is a certificate's: one quote from a document is the least it rests on.
            Source document = sources.stream().filter(s -> s.kind() == IssueEvidence.Source.DOCUMENT).findFirst()
                    .orElse(null);
            if (document == null) {
                return null;
            }
            return new Finding(code, document.stepId(), document.documentId(),
                    IssueParams.ofSuggestion(document.docType(), confidence, quotes),
                    ConsistencyRules.fingerprint(code, document.stepId(), document.documentId(), category),
                    "AI suggestion: the scope of " + document.ref() + " may not cover the product or the step");
        }
        if (sources.size() < 2) {
            return null;
        }
        // The pair of sources is the suggestion's identity: another wording of the same contradiction is not new.
        Set<String> ids = new LinkedHashSet<>();
        sources.stream().map(AiConsistencyCheck::idOf).sorted().forEach(ids::add);
        Source first = sources.getFirst();
        Source step = sources.stream().filter(s -> s.stepId() != null).findFirst().orElse(first);
        Source document = sources.stream().filter(s -> s.documentId() != null).findFirst().orElse(null);
        return new Finding(code, step.stepId(), document == null ? null : document.documentId(),
                IssueParams.ofSuggestion(document == null ? null : document.docType(), confidence, quotes),
                ConsistencyRules.fingerprint(code, null, null, String.join("|", ids)),
                "AI suggestion: " + sources.get(0).ref() + " and " + sources.get(1).ref() + " may contradict");
    }

    private static String idOf(Source source) {
        return source.documentId() != null ? "D" + source.documentId()
                : source.stepId() != null ? "S" + source.stepId() : "P";
    }

    /** The quote, made safe to store and show; null when it is too short or too long to be one. */
    static @Nullable String quote(String raw) {
        if (raw.length() > MAX_QUOTE * 2) {
            return null;
        }
        String cleaned = DocumentText.clean(raw);
        if (cleaned == null || cleaned.length() < MIN_QUOTE || cleaned.length() > MAX_QUOTE) {
            return null;
        }
        return cleaned;
    }

    enum Match { EXACT, LOOSE, NONE }

    /** Whether the source holds the quote: as it is, or with case, Turkish dots and spacing ignored. */
    static Match match(String quote, String source) {
        String text = squash(source);
        if (text.contains(squash(quote))) {
            return Match.EXACT;
        }
        return squash(Folding.fold(source)).contains(squash(Folding.fold(quote))) ? Match.LOOSE : Match.NONE;
    }

    private static String squash(String text) {
        return text.replaceAll("\\s+", " ").strip();
    }

    private static byte[] nonce() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /** A list of findings, each a code and up to two quotes with their source (Gemini's OpenAPI subset). */
    private static Map<String, Object> schema() {
        Map<String, Object> quote = new LinkedHashMap<>();
        quote.put("ref", Map.of("type", "STRING", "description", "Reference of the source: P, S1, D1…"));
        quote.put("quote", Map.of("type", "STRING", "description", "Exact words from that source, at most 200 characters"));
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("code", Map.of("type", "STRING", "enum", List.of("AI-01", "AI-02")));
        item.put("evidence", Map.of("type", "ARRAY", "items", Map.of("type", "OBJECT", "properties", quote,
                "required", List.of("ref", "quote"), "propertyOrdering", List.of("ref", "quote"))));
        Map<String, Object> finding = Map.of("type", "OBJECT", "properties", item, "required",
                List.of("code", "evidence"), "propertyOrdering", List.of("code", "evidence"));
        return Map.of("type", "OBJECT", "properties", Map.of("findings", Map.of("type", "ARRAY", "items", finding)),
                "required", List.of("findings"));
    }

    private static String loadPrompt() {
        try (InputStream in = new ClassPathResource(PROMPT).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Prompt " + PROMPT + " is missing", e);
        }
    }
}
