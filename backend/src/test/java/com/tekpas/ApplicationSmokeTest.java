package com.tekpas;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@ActiveProfiles("test")
class ApplicationSmokeTest {

    private final HttpClient http = HttpClient.newHttpClient();

    @Autowired
    JdbcTemplate jdbc;

    @LocalServerPort
    int port;

    @Test
    void flywayAppliesAllMigrations() {
        var versions = jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String.class);

        assertThat(versions).containsExactly("1", "2", "3");
    }

    @Test
    void schemaHasSixteenTables() {
        Integer tables = jdbc.queryForObject("""
                SELECT count(*) FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                  AND table_name <> 'flyway_schema_history'
                """, Integer.class);

        assertThat(tables).isEqualTo(16);
    }

    @Test
    void healthIsPublicAndUp() throws Exception {
        var response = get("/actuator/health");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"");
    }

    /** Render health checks and the keep-awake cron use this; it must not need the database. */
    @Test
    void livenessIsPublicAndUp() throws Exception {
        var response = get("/actuator/health/liveness");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"status\":\"UP\"").doesNotContain("db");
    }

    @Test
    void apiDocsArePublic() throws Exception {
        assertThat(get("/v3/api-docs").statusCode()).isEqualTo(200);
    }

    @Test
    void everythingElseIsClosed() throws Exception {
        var response = get("/api/v1/anything");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type")).hasValue("application/problem+json");
        assertThat(response.body()).contains("\"type\":\"urn:tekpas:problem:unauthorized\"");
        assertThat(get("/actuator/env").statusCode()).isEqualTo(401);
    }

    private HttpResponse<String> get(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
