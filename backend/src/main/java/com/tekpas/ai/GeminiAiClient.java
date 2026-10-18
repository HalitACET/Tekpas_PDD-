package com.tekpas.ai;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Gemini's {@code models/{model}:generateContent} over REST with Spring's {@code RestClient} (no SDK). The answer is
 * constrained to JSON by {@code responseMimeType} and {@code responseSchema}; no tools are declared, so the model
 * cannot call anything. The key goes in the {@code x-goog-api-key} header only (never in the URL, which ends up in
 * access logs), and no error message carries the key, the request or the response body.
 */
final class GeminiAiClient implements AiClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    /** A model id as AI Studio lists it; it goes into the path, so nothing else is allowed. */
    static final Pattern MODEL = Pattern.compile("[a-z0-9][a-z0-9.-]{0,99}");

    private final String model;
    private final URI endpoint;
    private final int maxOutputTokens;
    private final RestClient client;
    private final ObjectMapper json;

    GeminiAiClient(String baseUrl, String apiKey, String model, Duration timeout, int maxOutputTokens,
            ObjectMapper json) {
        String id = model.strip().startsWith("models/") ? model.strip().substring("models/".length()) : model.strip();
        if (!MODEL.matcher(id).matches()) {
            throw new IllegalStateException("GEMINI_MODEL is not a valid model id");
        }
        this.model = id;
        this.endpoint = URI.create(stripTrailingSlash(baseUrl) + "/models/" + id + ":generateContent");
        this.maxOutputTokens = maxOutputTokens;
        this.json = json;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(timeout);
        this.client = RestClient.builder()
                .requestFactory(factory)
                .defaultHeader("x-goog-api-key", apiKey)
                .build();
    }

    @Override
    public String model() {
        return model;
    }

    @Override
    public String generateJson(AiRequest request) {
        String body;
        try {
            body = client.post().uri(endpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(json.writeValueAsString(requestBody(request)))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            throw failed(e.getStatusCode().value());
        } catch (RestClientException e) {
            // Timeouts and connection failures; the cause's message may name the host, never more.
            throw new AiException(AiException.Kind.UNAVAILABLE, "LLM call failed (no response)");
        }
        return answerText(body);
    }

    private Map<String, Object> requestBody(AiRequest request) {
        List<Map<String, Object>> parts = new ArrayList<>();
        for (AiRequest.Part part : request.document()) {
            switch (part) {
                case AiRequest.Text text -> parts.add(Map.of("text", text.text()));
                case AiRequest.File file -> parts.add(Map.of("inlineData", Map.of(
                        "mimeType", file.mimeType(),
                        "data", Base64.getEncoder().encodeToString(file.data()))));
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("systemInstruction", Map.of("parts", List.of(Map.of("text", request.instruction()))));
        body.put("contents", List.of(Map.of("role", "user", "parts", parts)));
        body.put("generationConfig", Map.of(
                "responseMimeType", "application/json",
                "responseSchema", request.responseSchema(),
                "temperature", 0,
                "candidateCount", 1,
                "maxOutputTokens", maxOutputTokens));
        return body;
    }

    /** The first candidate's text, if the prompt was not blocked and the answer was not cut off. */
    private String answerText(String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            throw new AiException(AiException.Kind.NO_ANSWER, "LLM response is not JSON");
        }
        if (root == null || !root.path("promptFeedback").path("blockReason").isMissingNode()) {
            throw new AiException(AiException.Kind.NO_ANSWER, "LLM refused the request");
        }
        JsonNode candidate = root.path("candidates").path(0);
        String finish = candidate.path("finishReason").asString("");
        if (candidate.isMissingNode() || !(finish.isEmpty() || "STOP".equals(finish))) {
            throw new AiException(AiException.Kind.NO_ANSWER,
                    "LLM gave no complete answer" + (finish.matches("[A-Z_]{1,40}") ? " (" + finish + ")" : ""));
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode part : candidate.path("content").path("parts")) {
            if (part.path("text").isString() && !part.path("thought").asBoolean(false)) {
                text.append(part.path("text").asString());
            }
        }
        if (text.isEmpty()) {
            throw new AiException(AiException.Kind.NO_ANSWER, "LLM answer is empty");
        }
        return text.toString();
    }

    private static AiException failed(int status) {
        AiException.Kind kind;
        if (status == 429) {
            kind = AiException.Kind.RATE_LIMITED;
        } else if (status == 408 || status >= 500) {
            kind = AiException.Kind.UNAVAILABLE;
        } else {
            kind = AiException.Kind.REJECTED;
        }
        return new AiException(kind, "LLM call failed (HTTP " + status + ")");
    }

    private static String stripTrailingSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
