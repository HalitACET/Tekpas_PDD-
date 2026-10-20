package com.tekpas.passport;

import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobFailedPermanently;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * After a publishing or a withdrawal the web app's cached passport page is stale (docs/m6-plan.md §5.3). This job (1)
 * tells the web app to drop it ({@code POST /api/passport-cache}, bearer secret) and (2) asks for the page in each
 * language once, so the next scan is served from the cache while the backend, which is awake right now, has just
 * filled it. The warming is best effort: a failure there is logged, not retried. Without a secret (local, tests) there
 * is nothing to call and the job ends at once.
 */
@Component
class PassportCacheRefreshJob implements JobHandler<PassportCacheRefreshJob.Payload> {

    private static final Logger log = LoggerFactory.getLogger(PassportCacheRefreshJob.class);

    static final List<String> LANGUAGES = List.of("tr", "en", "de");
    static final Duration CALL_TIMEOUT = Duration.ofSeconds(20);

    /** The code whose page changed. */
    record Payload(String gtin, String batchNo) {
    }

    private final PublicProperties properties;
    private final RestClient client;

    PassportCacheRefreshJob(PublicProperties properties) {
        this.properties = properties;
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(CALL_TIMEOUT);
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public JobType type() {
        return JobType.PASSPORT_CACHE_REFRESH;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        // The revalidation plus three warming requests, each limited to CALL_TIMEOUT.
        return CALL_TIMEOUT.multipliedBy(4).plusSeconds(10);
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        if (!properties.canRefreshCache()) {
            log.debug("No REVALIDATE_SECRET: the web cache is not refreshed");
            return;
        }
        String base = properties.baseUrl().replaceAll("/+$", "");
        try {
            client.post().uri(base + "/api/passport-cache")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.revalidateSecret())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("gtin", payload.gtin(), "batchNo", payload.batchNo()))
                    .retrieve().toBodilessEntity();
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            // A wrong secret or a missing route does not heal by waiting; the others (5xx, 429, timeouts) may.
            if (status == 401 || status == 403 || status == 404) {
                throw new JobFailedPermanently("The web app refused the cache refresh (HTTP " + status + ")");
            }
            throw new IllegalStateException("The web app answered the cache refresh with HTTP " + status);
        } catch (RestClientException e) {
            throw new IllegalStateException("The web app could not be reached for the cache refresh", e);
        }
        for (String lang : LANGUAGES) {
            try {
                client.get().uri(base + Gs1DigitalLink.path(payload.gtin(), payload.batchNo()) + "?lang=" + lang)
                        .retrieve().toBodilessEntity();
            } catch (RestClientResponseException e) {
                // 404 and 410 are pages too (a withdrawn passport); they are warmed like any other.
                log.debug("Warming {} answered HTTP {}", lang, e.getStatusCode().value());
            } catch (RestClientException e) {
                log.warn("Warming the {} passport page failed: {}", lang, e.getMessage());
            }
        }
    }
}
