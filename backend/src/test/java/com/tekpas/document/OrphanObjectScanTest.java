package com.tekpas.document;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tekpas.common.storage.StorageProperties;
import com.tekpas.common.storage.StorageUnavailableException;
import com.tekpas.document.DocumentTestSupport.Setup;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import com.tekpas.support.FakeFileStorage;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import com.tekpas.support.TestFixtures;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/** Storage objects without a document are reported, and removed only when asked to (docs/m10-plan.md T6). */
@IntegrationTest
class OrphanObjectScanTest {

    private static final String FORGOTTEN = "docs/00000000-0000-0000-0000-00000000dead/forgotten";
    private static final String UPLOADING = "docs/00000000-0000-0000-0000-00000000dead/uploading";
    private static final String ELSEWHERE = "exports/old";

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
    OrphanObjectScan scan;

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

    /**
     * A document uploaded through the API, an object forgotten three days ago, one stored a moment ago (its row is
     * about to commit) and one outside {@code docs/}. Returns the document's key.
     */
    private String fill() {
        Setup s = t.setup(fixtures.tenant());
        String id = fixtures.body(t.uploadPdf(s.tenant(), s.yarnStep())).path("id").asString();
        Instant now = Instant.now();
        storage.putAt(FORGOTTEN, now.minus(Duration.ofDays(3)));
        storage.putAt(UPLOADING, now.minus(Duration.ofMinutes(5)));
        storage.putAt(ELSEWHERE, now.minus(Duration.ofDays(3)));
        return jdbc.queryForObject("SELECT file_key FROM document WHERE id = ?::uuid", String.class, id);
    }

    @Test
    void byDefaultAnOldObjectWithoutADocumentIsOnlyReported() {
        String document = fill();

        OrphanObjectScan.Result result = scan.run();

        assertThat(result.orphans()).containsExactly(FORGOTTEN);
        assertThat(result.removed()).isFalse();
        assertThat(result.scanned()).isEqualTo(3);
        assertThat(storage.get(FORGOTTEN)).isNotNull();
        assertThat(storage.get(document)).isNotNull();
    }

    @Test
    void withTheFlagItIsRemovedAndEverythingElseStays() {
        String document = fill();
        OrphanObjectScan removing = new OrphanObjectScan(storage, jdbc, clock, new StorageProperties(
                StorageProperties.Provider.NONE, Path.of(".storage"),
                new StorageProperties.Supabase("", "", "", Duration.ofSeconds(30)), true));

        OrphanObjectScan.Result result = removing.run();

        assertThat(result.orphans()).containsExactly(FORGOTTEN);
        assertThat(result.removed()).isTrue();
        assertThat(storage.get(FORGOTTEN)).isNull();
        assertThat(storage.get(document)).isNotNull();
        assertThat(storage.get(UPLOADING)).isNotNull();
        assertThat(storage.get(ELSEWHERE)).isNotNull();
    }

    @Test
    void anHourLaterTheObjectBeingUploadedCountsToo() {
        fill();
        clock.advance(Duration.ofHours(1));

        assertThat(scan.run().orphans()).containsExactly(FORGOTTEN, UPLOADING);
    }

    @Test
    void aStorageThatCannotBeListedDoesNotFailTheDailyCleanup() {
        storage.unavailable(true);
        assertThatThrownBy(scan::run).isInstanceOf(StorageUnavailableException.class);

        long id = queue.enqueue(JobType.DOCUMENT_CLEANUP, new DocumentCleanupJob.Payload());
        while (worker.runPending() > 0) {
            // drain: other tests may have left jobs behind
        }

        assertThat(jdbc.queryForObject("SELECT status FROM job WHERE id = ?", String.class, id)).isEqualTo("DONE");
    }
}
