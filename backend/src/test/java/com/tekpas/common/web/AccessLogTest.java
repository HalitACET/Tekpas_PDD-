package com.tekpas.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

class AccessLogTest {

    /** A link token as the backend makes them: 32 random bytes in base64url. */
    static final String TOKEN = "q3J8vXk2LmN9pR4sT7wY1zA5bC8dE0fG6hI2jK4lM7n";

    @Nested
    class Masking {

        @ParameterizedTest
        @CsvSource({
            "/r/" + TOKEN + ",                                         /r/***",
            "/r/short,                                                 /r/***",
            "/api/v1/public/requests/" + TOKEN + "/submit,             /api/v1/public/requests/***/submit",
            "/api/v1/public/requests/" + TOKEN + "/documents,          /api/v1/public/requests/***/documents",
            "/api/v1/batches/30000000-0000-0000-0000-000000000001,     /api/v1/batches/30000000-0000-0000-0000-000000000001",
            "/api/v1/products/20000000-0000-0000-0000-000000000001/chain-preview, "
                    + "/api/v1/products/20000000-0000-0000-0000-000000000001/chain-preview",
            "/api/v1/batches/status-counts,                            /api/v1/batches/status-counts",
            "/api/v1/passports/01/02012345000018/10/L2611A,            /api/v1/passports/01/02012345000018/10/L2611A",
            "/,                                                        /",
        })
        void linkTokensAreMaskedIdsAndWordsStay(String path, String logged) {
            assertThat(AccessLogFilter.maskPath(path)).isEqualTo(logged);
        }
    }

    @Nested
    @IntegrationTest
    @ExtendWith(OutputCaptureExtension.class)
    class Requests {

        @Autowired
        TestFixtures fixtures;

        @Test
        void oneLineWithIdMethodPathStatusAndDuration(CapturedOutput output) {
            Tenant tenant = fixtures.tenant();

            MvcTestResult result = fixtures.get(tenant, "/api/v1/products");

            String id = result.getResponse().getHeader(RequestId.HEADER);
            assertThat(output.getOut()).containsPattern("\\[" + id + "\\] com\\.tekpas\\.access\\s+: GET /api/v1/products 200 \\d+ms");
        }

        @Test
        void neverTheQueryStringHeadersOrBody(CapturedOutput output) {
            Tenant tenant = fixtures.tenant();
            String secret = "gizli-" + UUID.randomUUID();

            MvcTestResult result = fixtures.mvc().post().uri("/api/v1/products?q=" + secret)
                    .header(HttpHeaders.AUTHORIZATION, tenant.bearer())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + secret + "\"}").exchange();

            String id = result.getResponse().getHeader(RequestId.HEADER);
            String line = output.getOut().lines().filter(l -> l.contains("[" + id + "] com.tekpas.access")).findFirst()
                    .orElseThrow();
            assertThat(line).endsWith("POST /api/v1/products 400 " + line.substring(line.lastIndexOf(' ') + 1));
            assertThat(output.getOut()).doesNotContain(secret).doesNotContain(tenant.accessToken());
        }

        @Test
        void tokensInThePathAreMasked(CapturedOutput output) {
            fixtures.mvc().get().uri("/api/v1/public/requests/" + TOKEN).exchange();

            assertThat(output.getOut()).contains("GET /api/v1/public/requests/*** ").doesNotContain(TOKEN);
        }

        @Test
        void healthChecksAreNotLogged(CapturedOutput output) {
            fixtures.mvc().get().uri("/actuator/health/liveness").exchange();
            fixtures.mvc().get().uri("/actuator/health").exchange();

            assertThat(output.getOut()).doesNotContain("/actuator/health");
        }
    }
}
