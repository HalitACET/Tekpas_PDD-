package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.awt.Color;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import tools.jackson.databind.ObjectMapper;

/**
 * The mobile upload queue sends an upload again when its answer was lost (docs/m9-plan.md §4.4): the same
 * Idempotency-Key must never make a second document.
 */
@IntegrationTest
class PhotoUploadKeyTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    ObjectMapper json;

    @Autowired
    JdbcTemplate jdbc;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
    }

    MvcTestResult photos(Tenant who, String stepId, String key, Color colour) throws Exception {
        var request = fixtures.mvc().post().uri("/api/v1/steps/" + stepId + "/documents/photos").multipart()
                .file(new MockMultipartFile("pages", "IMG_1.jpg", "image/jpeg",
                        PhotoDocumentsTest.jpeg(600, 800, colour)))
                .header(HttpHeaders.AUTHORIZATION, who.bearer());
        if (key != null) {
            request = request.header("Idempotency-Key", key);
        }
        return request.exchange();
    }

    long documents(String stepId) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM document WHERE step_id = ?::uuid", Long.class, stepId);
        return n == null ? 0 : n;
    }

    @Test
    void aRetryWithTheSameKeyAnswersWithTheFirstDocument() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String key = UUID.randomUUID().toString();

        MvcTestResult first = photos(owner, s.yarnStep(), key, Color.WHITE);
        assertThat(first).hasStatus(202);
        // The phone took a new photo meanwhile? Still the same upload: the key decides, not the pages.
        MvcTestResult again = photos(owner, s.yarnStep(), key, Color.YELLOW);
        assertThat(again).hasStatus(200);

        assertThat(fixtures.body(again).path("id").asString()).isEqualTo(fixtures.body(first).path("id").asString());
        assertThat(documents(s.yarnStep())).isEqualTo(1);
        assertThat(storage.objects()).hasSize(1);
    }

    @Test
    void aKeyBelongsToItsStepAndItsCompany() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String key = UUID.randomUUID().toString();
        assertThat(photos(owner, s.yarnStep(), key, Color.WHITE)).hasStatus(202);

        MvcTestResult otherStep = photos(owner, s.fabricStep(), key, Color.WHITE);
        assertThat(otherStep).hasStatus(409);
        assertThat(fixtures.body(otherStep).path("reason").asString()).isEqualTo("UPLOAD_KEY_REUSED");

        Tenant stranger = fixtures.tenant();
        Setup theirs = t.setup(stranger);
        assertThat(photos(stranger, theirs.yarnStep(), key, Color.WHITE)).hasStatus(202);
        assertThat(documents(theirs.yarnStep())).isEqualTo(1);

        assertThat(photos(owner, s.yarnStep(), "not-a-uuid", Color.WHITE)).hasStatus(400);
        assertThat(photos(owner, s.yarnStep(), null, Color.GREEN)).hasStatus(202);
        assertThat(documents(s.yarnStep())).isEqualTo(2);
    }

    @Test
    void twoRequestsAtOnceWithOneKeyMakeOneDocument() throws Exception {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String key = UUID.randomUUID().toString();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Integer> upload = () -> photos(owner, s.yarnStep(), key, Color.WHITE).getResponse().getStatus();
            List<Future<Integer>> both = pool.invokeAll(List.of(upload, upload));
            assertThat(List.of(both.get(0).get(), both.get(1).get())).containsExactlyInAnyOrder(202, 200);
        } finally {
            pool.shutdownNow();
        }
        assertThat(documents(s.yarnStep())).isEqualTo(1);
    }
}
