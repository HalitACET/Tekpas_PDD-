package com.tekpas.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Gemini's REST contract against a fake HTTP server: no key, no network, no SDK, no extra library. */
class GeminiAiClientTest {

    private static final String KEY = "test-key-not-a-secret";
    private static final String SECRET_TEXT = "Certificate holder: Ornek Iplik";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private record Seen(String method, String path, String query, String apiKey, String authorization, String body) {
    }

    private record Reply(int status, String body) {
    }

    private HttpServer server;
    private final List<Seen> seen = new CopyOnWriteArrayList<>();
    private final AtomicReference<Reply> reply = new AtomicReference<>();
    private final AtomicReference<Duration> delay = new AtomicReference<>(Duration.ZERO);

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", this::handle);
        server.start();
        reply.set(new Reply(200, answer("{\"certNo\":\"DEMO-1\"}", "STOP")));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private GeminiAiClient client(Duration timeout) {
        return new GeminiAiClient("http://localhost:" + server.getAddress().getPort() + "/v1beta/", KEY,
                "gemini-test-flash-lite", timeout, 512, JSON);
    }

    private void handle(HttpExchange exchange) throws IOException {
        seen.add(new Seen(exchange.getRequestMethod(), exchange.getRequestURI().getRawPath(),
                exchange.getRequestURI().getRawQuery(), exchange.getRequestHeaders().getFirst("x-goog-api-key"),
                exchange.getRequestHeaders().getFirst("Authorization"),
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
        try {
            Thread.sleep(delay.get().toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        byte[] out = reply.get().body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(reply.get().status(), out.length == 0 ? -1 : out.length);
        if (out.length > 0) {
            exchange.getResponseBody().write(out);
        }
        exchange.close();
    }

    private static String answer(String text, String finishReason) {
        return JSON.writeValueAsString(Map.of("candidates", List.of(Map.of(
                "content", Map.of("role", "model", "parts", List.of(Map.of("text", text))),
                "finishReason", finishReason))));
    }

    private static AiRequest request() {
        return new AiRequest("Our instruction", List.of(new AiRequest.Text("<<<DOCUMENT x\n" + SECRET_TEXT + "\n")),
                Map.of("type", "OBJECT"));
    }

    @Test
    void postsTheRequestWithTheKeyInAHeaderOnly() {
        String text = client(Duration.ofSeconds(5)).generateJson(request());

        assertThat(text).isEqualTo("{\"certNo\":\"DEMO-1\"}");
        Seen call = seen.getFirst();
        assertThat(call.method()).isEqualTo("POST");
        assertThat(call.path()).isEqualTo("/v1beta/models/gemini-test-flash-lite:generateContent");
        assertThat(call.query()).isNull();
        assertThat(call.apiKey()).isEqualTo(KEY);
        assertThat(call.authorization()).isNull();
        JsonNode body = JSON.readTree(call.body());
        assertThat(body.path("systemInstruction").path("parts").path(0).path("text").asString())
                .isEqualTo("Our instruction");
        assertThat(body.path("contents").path(0).path("role").asString()).isEqualTo("user");
        assertThat(body.path("contents").path(0).path("parts").path(0).path("text").asString()).contains(SECRET_TEXT);
        assertThat(body.path("generationConfig").path("responseMimeType").asString()).isEqualTo("application/json");
        assertThat(body.path("generationConfig").path("responseSchema").path("type").asString()).isEqualTo("OBJECT");
        assertThat(body.path("generationConfig").path("maxOutputTokens").asInt()).isEqualTo(512);
        // The model can only answer: no tools, no function declarations.
        assertThat(body.has("tools")).isFalse();
        assertThat(body.has("toolConfig")).isFalse();
    }

    @Test
    void aFileGoesInlineAsBase64() {
        byte[] scan = {'%', 'P', 'D', 'F', '-', 1, 2, 3};
        client(Duration.ofSeconds(5)).generateJson(new AiRequest("i",
                List.of(new AiRequest.File("application/pdf", scan)), Map.of("type", "OBJECT")));

        JsonNode inline = JSON.readTree(seen.getFirst().body()).path("contents").path(0).path("parts").path(0)
                .path("inlineData");
        assertThat(inline.path("mimeType").asString()).isEqualTo("application/pdf");
        assertThat(Base64.getDecoder().decode(inline.path("data").asString())).isEqualTo(scan);
    }

    @Test
    void quotaIsNotRetriableAndServerErrorsAre() {
        reply.set(new Reply(429, "{\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class, e -> {
                    assertThat(e.kind()).isEqualTo(AiException.Kind.RATE_LIMITED);
                    assertThat(e.retryable()).isFalse();
                });

        reply.set(new Reply(503, "{}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class, e -> assertThat(e.retryable()).isTrue());

        reply.set(new Reply(400, "{}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class,
                        e -> assertThat(e.kind()).isEqualTo(AiException.Kind.REJECTED));
    }

    @Test
    void aSlowAnswerTimesOutAsRetriable() {
        delay.set(Duration.ofMillis(1500));
        assertThatThrownBy(() -> client(Duration.ofMillis(300)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class,
                        e -> assertThat(e.kind()).isEqualTo(AiException.Kind.UNAVAILABLE));
    }

    @Test
    void errorMessagesCarryNeitherTheKeyNorTheDocumentNorTheResponse() {
        // A provider error that echoes the request back.
        String echo = "{\"error\":{\"message\":\"bad request " + KEY + " " + SECRET_TEXT + "\"}}";
        for (int status : new int[] {400, 403, 429, 500}) {
            reply.set(new Reply(status, echo));
            assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                    .isInstanceOfSatisfying(AiException.class, e -> {
                        assertThat(e.getMessage()).isEqualTo("LLM call failed (HTTP " + status + ")");
                        assertThat(e.getCause()).isNull();
                        assertThat(e.getStackTrace()).isEmpty();
                    });
        }
    }

    @Test
    void aBlockedOrCutOffAnswerIsNoAnswer() {
        reply.set(new Reply(200, "{\"promptFeedback\":{\"blockReason\":\"PROHIBITED_CONTENT\"}}"));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class,
                        e -> assertThat(e.kind()).isEqualTo(AiException.Kind.NO_ANSWER));

        reply.set(new Reply(200, answer("{\"certNo\":\"DEM", "MAX_TOKENS")));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class, e -> {
                    assertThat(e.kind()).isEqualTo(AiException.Kind.NO_ANSWER);
                    assertThat(e.getMessage()).contains("MAX_TOKENS").doesNotContain("DEM");
                });

        reply.set(new Reply(200, "not json " + SECRET_TEXT));
        assertThatThrownBy(() -> client(Duration.ofSeconds(5)).generateJson(request()))
                .isInstanceOfSatisfying(AiException.class,
                        e -> assertThat(e.getMessage()).doesNotContain(SECRET_TEXT));
    }

    @Test
    void theModelIdCannotReachOutsideItsPathSegment() {
        assertThatThrownBy(() -> new GeminiAiClient("https://example.invalid", KEY, "../../v1/files?x=",
                Duration.ofSeconds(1), 1, JSON)).isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(KEY);
        assertThat(new GeminiAiClient("https://example.invalid", KEY, "models/gemini-x-lite", Duration.ofSeconds(1),
                1, JSON).model()).isEqualTo("gemini-x-lite");
    }
}
