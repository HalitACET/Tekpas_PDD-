package com.tekpas.passport.translation;

import com.tekpas.ai.AiClient;
import com.tekpas.ai.AiException;
import com.tekpas.ai.AiRequest;
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
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Asks the LLM for translations of a batch's free texts (docs/m11-plan.md §3). Only reached behind the
 * {@code LlmGate} (rule 4) and only as suggestions a person approves (rule 5).
 *
 * <p>Our instruction ({@code prompts/passport-translation.md}) goes as the system instruction, the texts as the user's
 * turn between markers carrying a random value; no tools, the answer follows a schema. The answer is untrusted input:
 * only references and languages that were asked for, plain text of a sensible length, no markup and no links.
 */
@Component
class PassportTranslator {

    static final String PROMPT = "prompts/passport-translation.md";
    static final int MAX_TEXT = 2000;
    /** A translation may be longer than its source (German), not a different text altogether. */
    static final int LENGTH_FACTOR = 3;
    static final int LENGTH_SLACK = 40;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern MARKUP = Pattern.compile("[<>]|://|\\bwww\\.", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONTROL = Pattern.compile("[\\p{Cc}&&[^\\n]]");
    private static final Map<String, Object> SCHEMA = schema();

    /** A translation the model suggested, already checked. */
    record Suggestion(String field, String language, String text) {
    }

    /** A text to translate and the languages wanted for it. */
    record Wanted(TranslatableText text, List<String> languages) {
    }

    private final AiClient ai;
    private final ObjectMapper json;
    private final String instruction;

    PassportTranslator(AiClient ai, ObjectMapper json) {
        this.ai = ai;
        this.json = json;
        this.instruction = loadPrompt();
    }

    /** @throws AiException when the LLM gives no answer (the caller decides: retry or give up) */
    List<Suggestion> translate(List<Wanted> wanted) {
        if (wanted.isEmpty()) {
            return List.of();
        }
        String marker = HexFormat.of().formatHex(nonce());
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < wanted.size(); i++) {
            Wanted w = wanted.get(i);
            body.append('T').append(i + 1).append(" [").append(w.text().language()).append(" -> ")
                    .append(String.join(", ", w.languages())).append("]: ").append(w.text().text()).append("\n\n");
        }
        String data = "<<<DATA " + marker + "\n" + body.toString().strip() + "\nDATA " + marker + ">>>";
        String answer = ai.generateJson(new AiRequest(instruction.replace("{marker}", marker),
                List.of(new AiRequest.Text(data)), SCHEMA));
        return answer(answer, wanted);
    }

    /** The model's answer, checked like any outside input: only what was asked, once each. */
    List<Suggestion> answer(String raw, List<Wanted> wanted) {
        JsonNode root;
        try {
            root = json.readTree(raw);
        } catch (JacksonException e) {
            return List.of();
        }
        JsonNode list = root == null ? null : root.get("translations");
        if (list == null || !list.isArray()) {
            return List.of();
        }
        Map<String, Wanted> byRef = new LinkedHashMap<>();
        for (int i = 0; i < wanted.size(); i++) {
            byRef.put("T" + (i + 1), wanted.get(i));
        }
        Set<String> seen = new LinkedHashSet<>();
        List<Suggestion> kept = new ArrayList<>();
        for (JsonNode item : list) {
            String ref = string(item, "ref");
            String language = string(item, "language");
            String text = string(item, "text");
            Wanted w = ref == null ? null : byRef.get(ref);
            if (w == null || language == null || text == null || !w.languages().contains(language)
                    || !seen.add(ref + "/" + language)) {
                continue;
            }
            String cleaned = clean(text, w.text().text().length());
            if (cleaned != null) {
                kept.add(new Suggestion(w.text().field(), language, cleaned));
            }
        }
        return kept;
    }

    /** Plain text of a sensible length, or null. */
    static @Nullable String clean(String text, int sourceLength) {
        String cleaned = CONTROL.matcher(text).replaceAll(" ").strip();
        int max = Math.min(MAX_TEXT, sourceLength * LENGTH_FACTOR + LENGTH_SLACK);
        if (cleaned.isEmpty() || cleaned.length() > max || MARKUP.matcher(cleaned).find()) {
            return null;
        }
        return cleaned;
    }

    private static @Nullable String string(@Nullable JsonNode node, String name) {
        JsonNode value = node == null ? null : node.get(name);
        return value != null && value.isString() ? value.asString() : null;
    }

    private static byte[] nonce() {
        byte[] bytes = new byte[12];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /** A list of translations, each the text's reference, a language and the text (Gemini's OpenAPI subset). */
    private static Map<String, Object> schema() {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("ref", Map.of("type", "STRING", "description", "Reference of the text: T1, T2…"));
        item.put("language", Map.of("type", "STRING", "enum", List.of("tr", "en", "de")));
        item.put("text", Map.of("type", "STRING", "description", "The translation, plain text"));
        Map<String, Object> translation = Map.of("type", "OBJECT", "properties", item, "required",
                List.of("ref", "language", "text"), "propertyOrdering", List.of("ref", "language", "text"));
        return Map.of("type", "OBJECT", "properties",
                Map.of("translations", Map.of("type", "ARRAY", "items", translation)), "required", List.of("translations"));
    }

    private static String loadPrompt() {
        try (InputStream in = new ClassPathResource(PROMPT).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Prompt " + PROMPT + " is missing", e);
        }
    }
}
