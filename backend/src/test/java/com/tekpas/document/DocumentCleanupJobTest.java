package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import com.tekpas.support.TestFixtures.Tenant;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/** Uploads of links that closed without a submission go 7 days later; everything else stays (PLAN M5 T3). */
@IntegrationTest
class DocumentCleanupJobTest {

    @Autowired
    TestFixtures fixtures;

    @Autowired
    FakeFileStorage storage;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @Autowired
    ObjectMapper json;

    @Autowired
    JobQueue queue;

    @Autowired
    JobWorker worker;

    DocumentTestSupport t;

    @BeforeEach
    void init() {
        storage.reset();
        t = new DocumentTestSupport(fixtures, storage, json);
    }

    @AfterEach
    void cleanUp() {
        storage.reset();
        clock.reset();
    }

    private void runCleanup() {
        queue.enqueue(JobType.DOCUMENT_CLEANUP, new DocumentCleanupJob.Payload());
        while (worker.runPending() > 0) {
            // earlier tests leave reading jobs behind; run until the cleanup had its turn
        }
    }

    private boolean exists(String id) {
        return jdbc.queryForObject("SELECT count(*) FROM document WHERE id = ?::uuid", Integer.class, id) == 1;
    }

    private String key(Tenant tenant, String id) {
        return "docs/" + tenant.company().getId() + "/" + id;
    }

    private void revoke(Tenant tenant, String stepId) {
        String requestId = jdbc.queryForObject("SELECT id::text FROM data_request WHERE step_id = ?::uuid "
                + "AND status IN ('SENT', 'OPENED')", String.class, stepId);
        assertThat(fixtures.post(tenant, "/api/v1/requests/" + requestId + "/revoke", Map.of())).hasStatus(204);
    }

    @Test
    void aRevokedLinksUploadsGoSevenDaysLaterAndTheRestStays() {
        Tenant owner = fixtures.tenant();
        Setup revokedStep = t.setup(owner);
        String revokedDoc = fixtures.body(t.publicPdf(t.link(owner, revokedStep.yarnStep()))).path("id").asString();
        revoke(owner, revokedStep.yarnStep());

        Setup verifiedStep = t.setup(owner);
        String verifiedDoc = fixtures.body(t.publicPdf(t.link(owner, verifiedStep.yarnStep()))).path("id").asString();
        jdbc.update("UPDATE document SET review_status = 'VERIFIED' WHERE id = ?::uuid", verifiedDoc);
        revoke(owner, verifiedStep.yarnStep());

        Setup submittedStep = t.setup(owner);
        String submittedToken = t.link(owner, submittedStep.yarnStep());
        String submittedDoc = fixtures.body(t.publicPdf(submittedToken)).path("id").asString();
        assertThat(t.publicSubmit(submittedToken)).hasStatusOk();

        String panelDoc = fixtures.body(t.uploadPdf(owner, revokedStep.fabricStep())).path("id").asString();

        clock.advance(Duration.ofDays(6));
        runCleanup();
        assertThat(exists(revokedDoc)).as("revoked 6 days ago").isTrue();

        clock.advance(Duration.ofDays(2));
        runCleanup();

        assertThat(exists(revokedDoc)).isFalse();
        assertThat(storage.get(key(owner, revokedDoc))).isNull();
        assertThat(jdbc.queryForObject("""
                SELECT detail->>'reason' FROM step_event
                WHERE step_id = ?::uuid AND kind = 'DOCUMENT_REMOVED' AND detail->>'documentId' = ?
                """, String.class, revokedStep.yarnStep(), revokedDoc)).isEqualTo(DocumentCleanupJob.REASON);
        assertThat(exists(verifiedDoc)).as("verified").isTrue();
        assertThat(exists(submittedDoc)).as("submitted link").isTrue();
        assertThat(exists(panelDoc)).as("panel upload").isTrue();
        assertThat(storage.get(key(owner, submittedDoc))).isNotNull();
        assertThat(storage.get(key(owner, panelDoc))).isNotNull();
    }

    @Test
    void anExpiredLinksUploadsGoSevenDaysAfterItsDeadline() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String doc = fixtures.body(t.publicPdf(t.link(owner, s.yarnStep()))).path("id").asString();

        // The link is valid for 7 days, so its uploads stay until day 14.
        clock.advance(Duration.ofDays(13));
        runCleanup();
        assertThat(exists(doc)).isTrue();

        clock.advance(Duration.ofDays(2));
        runCleanup();
        assertThat(exists(doc)).isFalse();
        assertThat(storage.get(key(owner, doc))).isNull();
    }

    @Test
    void anOpenLinksUploadsStay() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String doc = fixtures.body(t.publicPdf(t.link(owner, s.yarnStep()))).path("id").asString();

        clock.advance(Duration.ofDays(6));
        runCleanup();

        assertThat(exists(doc)).isTrue();
    }

    @Test
    void theCleanupJobEndsDoneAndAStorageOutageDoesNotStopIt() {
        Tenant owner = fixtures.tenant();
        Setup s = t.setup(owner);
        String doc = fixtures.body(t.publicPdf(t.link(owner, s.yarnStep()))).path("id").asString();
        revoke(owner, s.yarnStep());
        clock.advance(Duration.ofDays(8));
        storage.unavailable(true);

        long id = queue.enqueue(JobType.DOCUMENT_CLEANUP, new DocumentCleanupJob.Payload());
        worker.runPending();

        assertThat(jdbc.queryForObject("SELECT status FROM job WHERE id = ?", String.class, id)).isEqualTo("DONE");
        // The row is gone; the object stays until the storage answers (unreferenced, OrphanObjectScan reports it).
        assertThat(exists(doc)).isFalse();
    }
}
