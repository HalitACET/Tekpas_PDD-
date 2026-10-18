package com.tekpas.common.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The Supabase REST contract against a fake HTTP server (no account, no network, no extra library). */
class SupabaseFileStorageTest {

    private static final String SERVICE_KEY = "test-service-key-not-a-secret";

    private record Seen(String method, String path, String query, String authorization, String apikey,
            String contentType, String upsert, byte[] body) {
    }

    private record Reply(int status, String body) {
    }

    private HttpServer server;
    private final List<Seen> seen = new CopyOnWriteArrayList<>();
    private final AtomicReference<Reply> reply = new AtomicReference<>(new Reply(200, "{}"));
    private final AtomicReference<Duration> delay = new AtomicReference<>(Duration.ZERO);
    private SupabaseFileStorage storage;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", this::handle);
        server.start();
        storage = storage(Duration.ofSeconds(5));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private SupabaseFileStorage storage(Duration timeout) {
        return new SupabaseFileStorage("http://localhost:" + server.getAddress().getPort() + "/", SERVICE_KEY,
                "tekpas-docs", timeout);
    }

    private void handle(HttpExchange exchange) throws IOException {
        byte[] body = exchange.getRequestBody().readAllBytes();
        seen.add(new Seen(exchange.getRequestMethod(), exchange.getRequestURI().getRawPath(),
                exchange.getRequestURI().getRawQuery(),
                exchange.getRequestHeaders().getFirst("Authorization"),
                exchange.getRequestHeaders().getFirst("apikey"),
                exchange.getRequestHeaders().getFirst("Content-Type"),
                exchange.getRequestHeaders().getFirst("x-upsert"), body));
        try {
            Thread.sleep(delay.get().toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        Reply r = reply.get();
        byte[] out = r.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(r.status(), out.length == 0 ? -1 : out.length);
        if (out.length > 0) {
            exchange.getResponseBody().write(out);
        }
        exchange.close();
    }

    @Test
    void putPostsTheBytesToThePrivateBucketWithoutOverwriting() {
        byte[] content = "%PDF-1.7 demo".getBytes(StandardCharsets.UTF_8);

        storage.put("docs/c1/d1", content, "application/pdf");

        assertThat(seen).hasSize(1);
        Seen s = seen.get(0);
        assertThat(s.method()).isEqualTo("POST");
        assertThat(s.path()).isEqualTo("/storage/v1/object/tekpas-docs/docs/c1/d1");
        assertThat(s.authorization()).isEqualTo("Bearer " + SERVICE_KEY);
        assertThat(s.apikey()).isEqualTo(SERVICE_KEY);
        assertThat(s.contentType()).isEqualTo("application/pdf");
        assertThat(s.upsert()).isEqualTo("false");
        assertThat(s.body()).isEqualTo(content);
    }

    @Test
    void putCarriesTheLargestAllowedObject() {
        byte[] content = new byte[(int) FileStorage.MAX_OBJECT_BYTES];

        storage.put("docs/c1/big", content, "image/png");

        assertThat(seen.get(0).body()).hasSize(content.length);
    }

    @Test
    void duplicateIsReportedWhetherSupabaseAnswers409Or400WithStatusCode409() {
        reply.set(new Reply(400, "{\"statusCode\":\"409\",\"error\":\"Duplicate\",\"message\":\"exists\"}"));
        assertThatThrownBy(() -> storage.put("docs/c1/d1", new byte[1], "application/pdf"))
                .isInstanceOf(StorageException.class).hasMessage("Storage object already exists");

        reply.set(new Reply(409, "{}"));
        assertThatThrownBy(() -> storage.put("docs/c1/d1", new byte[1], "application/pdf"))
                .isInstanceOf(StorageException.class).hasMessage("Storage object already exists");
    }

    @Test
    void failuresNameTheStatusAndNeverTheKeyOrTheResponseBody() {
        reply.set(new Reply(500, "{\"message\":\"echo " + SERVICE_KEY + " docs/c1/d1\"}"));

        assertThatThrownBy(() -> storage.put("docs/c1/d1", new byte[1], "application/pdf"))
                .isInstanceOf(StorageException.class)
                .hasMessage("Storage upload failed (HTTP 500)")
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(SERVICE_KEY).doesNotContain("docs/c1"));
    }

    @Test
    void aSlowServerEndsInAStorageExceptionNotAHang() {
        delay.set(Duration.ofSeconds(2));
        SupabaseFileStorage impatient = storage(Duration.ofMillis(300));

        assertThatThrownBy(() -> impatient.put("docs/c1/d1", new byte[1], "application/pdf"))
                .isInstanceOf(StorageException.class)
                .satisfies(e -> assertThat(e.getMessage()).doesNotContain(SERVICE_KEY));
    }

    @Test
    void anUnreachableServerEndsInAStorageException() {
        SupabaseFileStorage unreachable = new SupabaseFileStorage("http://localhost:1", SERVICE_KEY, "tekpas-docs",
                Duration.ofSeconds(1));

        assertThatThrownBy(() -> unreachable.delete("docs/c1/d1")).isInstanceOf(StorageException.class);
    }

    @Test
    void signedUrlAsksForTheLifetimeAndPointsBackAtTheProject() {
        reply.set(new Reply(200, "{\"signedURL\":\"/object/sign/tekpas-docs/docs/c1/d1?token=abc.def\"}"));

        URI url = storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), null);

        Seen s = seen.get(0);
        assertThat(s.method()).isEqualTo("POST");
        assertThat(s.path()).isEqualTo("/storage/v1/object/sign/tekpas-docs/docs/c1/d1");
        assertThat(new String(s.body(), StandardCharsets.UTF_8)).isEqualTo("{\"expiresIn\":60}");
        assertThat(url.toString()).isEqualTo("http://localhost:" + server.getAddress().getPort()
                + "/storage/v1/object/sign/tekpas-docs/docs/c1/d1?token=abc.def");
    }

    @Test
    void signedUrlCanForceADownloadWithAnEncodedName() {
        reply.set(new Reply(200, "{\"signedURL\":\"/object/sign/tekpas-docs/docs/c1/d1?token=abc\"}"));

        URI url = storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), "Sertifika & Föy.pdf");

        assertThat(url.getRawQuery()).isEqualTo("token=abc&download=Sertifika%20%26%20F%C3%B6y.pdf");
    }

    @Test
    void signedUrlRejectsAnAnswerThatDoesNotPointIntoTheSigningPath() {
        reply.set(new Reply(200, "{\"signedURL\":\"https://evil.example/steal\"}"));
        assertThatThrownBy(() -> storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), null))
                .isInstanceOf(StorageException.class);

        reply.set(new Reply(200, "{}"));
        assertThatThrownBy(() -> storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), null))
                .isInstanceOf(StorageException.class);
    }

    @Test
    void signedUrlLifetimeIsBounded() {
        assertThatThrownBy(() -> storage.signedDownloadUrl("docs/c1/d1", Duration.ZERO, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> storage.signedDownloadUrl("docs/c1/d1", Duration.ofHours(2), null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(seen).isEmpty();
    }

    @Test
    void deleteIsIdempotent() {
        storage.delete("docs/c1/d1");
        assertThat(seen.get(0).method()).isEqualTo("DELETE");
        assertThat(seen.get(0).path()).isEqualTo("/storage/v1/object/tekpas-docs/docs/c1/d1");

        reply.set(new Reply(404, "{\"statusCode\":\"404\",\"error\":\"not_found\"}"));
        storage.delete("docs/c1/d1");

        reply.set(new Reply(400, "{\"statusCode\":\"404\",\"error\":\"not_found\"}"));
        storage.delete("docs/c1/d1");

        reply.set(new Reply(503, ""));
        assertThatThrownBy(() -> storage.delete("docs/c1/d1")).isInstanceOf(StorageException.class)
                .hasMessage("Storage delete failed (HTTP 503)");
    }

    @Test
    void unsafeKeysNeverReachTheNetwork() {
        List<String> bad = new ArrayList<>(List.of("", "/abs", "../x", "a/../b", "a//b", "a b", "a\\b", ".hidden",
                "docs/c1/d1?x=1", "docs/c1/d1#f", "x".repeat(301)));
        for (String key : bad) {
            assertThatThrownBy(() -> storage.put(key, new byte[1], "application/pdf"))
                    .as(key).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> storage.delete(key)).as(key).isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> storage.signedDownloadUrl(key, Duration.ofSeconds(60), null))
                    .as(key).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(seen).isEmpty();
    }
}
