package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobFailedPermanently;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The web side is a fake HTTP server: what the job sends, what it does with the answers. */
class PassportCacheRefreshJobTest {

    record Call(String method, String uri, String authorization, String body) {
    }

    static final JobContext CONTEXT = new JobContext(1, 1, 4);
    static final PassportCacheRefreshJob.Payload PAYLOAD =
            new PassportCacheRefreshJob.Payload("02012345000025", "KP-2026-0915-A");
    static final String SECRET = "s".repeat(32);

    HttpServer server;
    final List<Call> calls = new CopyOnWriteArrayList<>();
    final AtomicInteger revalidateStatus = new AtomicInteger(200);
    final AtomicInteger pageStatus = new AtomicInteger(200);

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(exchange.getRequestMethod(), exchange.getRequestURI().toString(),
                    exchange.getRequestHeaders().getFirst("Authorization"), body));
            int status = exchange.getRequestURI().getPath().equals("/api/passport-cache") ? revalidateStatus.get()
                    : pageStatus.get();
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private PassportCacheRefreshJob job(String secret) {
        return new PassportCacheRefreshJob(new PublicProperties("http://127.0.0.1:" + server.getAddress().getPort() + "/",
                secret));
    }

    @Test
    void dropsTheCachedPageThenWarmsEachLanguageOnce() {
        job(SECRET).handle(PAYLOAD, CONTEXT);

        assertThat(calls).hasSize(4);
        Call revalidate = calls.get(0);
        assertThat(revalidate.method()).isEqualTo("POST");
        assertThat(revalidate.uri()).isEqualTo("/api/passport-cache");
        assertThat(revalidate.authorization()).isEqualTo("Bearer " + SECRET);
        assertThat(revalidate.body()).contains("\"gtin\":\"02012345000025\"").contains("\"batchNo\":\"KP-2026-0915-A\"");
        assertThat(calls.subList(1, 4)).extracting(Call::method).containsOnly("GET");
        assertThat(calls.subList(1, 4)).extracting(Call::uri).containsExactly(
                "/01/02012345000025/10/KP-2026-0915-A?lang=tr", "/01/02012345000025/10/KP-2026-0915-A?lang=en",
                "/01/02012345000025/10/KP-2026-0915-A?lang=de");
        // The secret goes only to the revalidation, never to the public page.
        assertThat(calls.subList(1, 4)).extracting(Call::authorization).containsOnly((String) null);
    }

    @Test
    void withoutASecretNothingIsCalled() {
        job("").handle(PAYLOAD, CONTEXT);
        job(null).handle(PAYLOAD, CONTEXT);

        assertThat(calls).isEmpty();
    }

    @Test
    void aRefusedSecretOrAMissingRouteFailsForGood() {
        for (int status : new int[] {401, 403, 404}) {
            calls.clear();
            revalidateStatus.set(status);

            assertThatThrownBy(() -> job(SECRET).handle(PAYLOAD, CONTEXT)).isInstanceOf(JobFailedPermanently.class)
                    .hasMessageContaining(String.valueOf(status)).hasMessageNotContaining(SECRET);
            // Nothing is warmed when the cache was not dropped.
            assertThat(calls).hasSize(1);
        }
    }

    @Test
    void aServerErrorIsRetried() {
        revalidateStatus.set(503);

        assertThatThrownBy(() -> job(SECRET).handle(PAYLOAD, CONTEXT)).isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(JobFailedPermanently.class).hasMessageContaining("503");
    }

    @Test
    void anUnreachableWebAppIsRetried() {
        server.stop(0);

        assertThatThrownBy(() -> job(SECRET).handle(PAYLOAD, CONTEXT)).isInstanceOf(IllegalStateException.class)
                .isNotInstanceOf(JobFailedPermanently.class);
    }

    @Test
    void aFailingWarmingRequestDoesNotFailTheJob() {
        pageStatus.set(500);

        job(SECRET).handle(PAYLOAD, CONTEXT);

        assertThat(calls).hasSize(4);
    }
}
