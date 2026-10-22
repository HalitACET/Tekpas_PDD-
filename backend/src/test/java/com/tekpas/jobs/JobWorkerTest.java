package com.tekpas.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.tekpas.jobs.JobStore.ClaimedJob;
import com.tekpas.support.IntegrationTest;
import com.tekpas.support.MutableClock;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * The job queue and worker (K9, PLAN M5 T3) with a test handler on AI_TRANSLATE_PASSPORT. The test runs its own
 * worker that knows only that handler (the application's own handler of the type stays out of it), so any other type
 * has no handler here. AI_TRANSLATE_PASSPORT is a type nothing else in the
 * test run queues. The worker thread is off in tests: {@link JobWorker#runPending()} is called directly.
 */
@IntegrationTest
class JobWorkerTest {

    /** What the test handler does with a payload. */
    record Order(String tag, String mode, long sleepMs) {

        static Order of(String mode) {
            return new Order(UUID.randomUUID().toString(), mode, 0);
        }
    }

    static class TestHandler implements JobHandler<Order> {

        final Map<String, AtomicInteger> runs = new ConcurrentHashMap<>();
        final List<String> givenUp = new CopyOnWriteArrayList<>();
        final List<JobContext> contexts = new CopyOnWriteArrayList<>();

        @Override
        public JobType type() {
            return JobType.AI_TRANSLATE_PASSPORT;
        }

        @Override
        public Class<Order> payloadType() {
            return Order.class;
        }

        @Override
        public Duration timeout() {
            return Duration.ofMillis(300);
        }

        @Override
        public void handle(Order order, JobContext context) throws Exception {
            runs.computeIfAbsent(order.tag(), t -> new AtomicInteger()).incrementAndGet();
            contexts.add(context);
            switch (order.mode()) {
                case "fail" -> throw new IllegalStateException("boom");
                case "permanent" -> throw new JobFailedPermanently("nothing to read");
                case "sleep" -> Thread.sleep(order.sleepMs());
                default -> { }
            }
        }

        @Override
        public void onGiveUp(Order order, String reason) {
            givenUp.add(order.tag() + ":" + reason);
        }

        int runs(Order order) {
            AtomicInteger count = runs.get(order.tag());
            return count == null ? 0 : count.get();
        }
    }

    @Autowired
    JobQueue queue;

    /** This test's worker: the test handler only, thread off like every worker in tests. */
    JobWorker worker;

    @Autowired
    JobStore store;

    final TestHandler handler = new TestHandler();

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    MutableClock clock;

    @Autowired
    PlatformTransactionManager transactions;

    @Autowired
    ObjectMapper json;

    /**
     * The database is shared by every test class: jobs other classes left behind (document readings) would be taken
     * first and push this class's jobs past one run. Only this class's own job type stays.
     */
    @BeforeEach
    void onlyOwnJobs() {
        worker = new JobWorker(handlers(), store, json, clock, false);
        jdbc.update("UPDATE job SET status = 'DONE' WHERE status IN ('QUEUED', 'RUNNING') AND type <> 'AI_TRANSLATE_PASSPORT'");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("UPDATE job SET status = 'DONE' WHERE type = 'AI_TRANSLATE_PASSPORT' AND status IN ('QUEUED', 'RUNNING')");
        clock.reset();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private ObjectProvider<JobHandler<?>> handlers() {
        return (ObjectProvider) new StaticListableBeanFactory(Map.of("testHandler", handler))
                .getBeanProvider(JobHandler.class);
    }

    private Map<String, Object> job(long id) {
        return jdbc.queryForMap("SELECT status, attempts, max_attempts, run_at, finished_at, last_error, locked_by "
                + "FROM job WHERE id = ?", id);
    }

    private Instant runAt(long id) {
        return ((Timestamp) job(id).get("run_at")).toInstant();
    }

    @Test
    void aJobRunsOnceAfterItsTransactionCommitsAndNeverIfItRollsBack() {
        TransactionTemplate tx = new TransactionTemplate(transactions);
        Order kept = Order.of("ok");
        Order dropped = Order.of("ok");
        Long id = tx.execute(status -> queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, kept));
        tx.executeWithoutResult(status -> {
            queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, dropped);
            status.setRollbackOnly();
        });

        assertThat(job(id).get("status")).isEqualTo("QUEUED");
        assertThat(worker.runPending()).isEqualTo(1);

        assertThat(handler.runs(kept)).isEqualTo(1);
        assertThat(handler.runs(dropped)).isZero();
        Map<String, Object> done = job(id);
        assertThat(done.get("status")).isEqualTo("DONE");
        assertThat(done.get("attempts")).isEqualTo(1);
        assertThat(done.get("finished_at")).isNotNull();
        assertThat(done.get("locked_by")).isNull();
        assertThat(worker.runPending()).isZero();
        assertThat(handler.runs(kept)).isEqualTo(1);
    }

    @Test
    void theHandlerGetsItsAttemptNumber() {
        Order order = Order.of("ok");
        long id = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, order);

        worker.runPending();

        assertThat(handler.contexts).anySatisfy(c -> {
            assertThat(c.jobId()).isEqualTo(id);
            assertThat(c.attempt()).isEqualTo(1);
            assertThat(c.maxAttempts()).isEqualTo(JobType.AI_TRANSLATE_PASSPORT.maxAttempts());
        });
    }

    @Test
    void aFailingJobIsRetriedAfter30SecondsThen2MinutesAndThenGivesUp() {
        Order order = Order.of("fail");
        long id = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, order);
        Instant start = clock.instant();

        worker.runPending();
        assertThat(job(id).get("status")).isEqualTo("QUEUED");
        assertThat(job(id).get("attempts")).isEqualTo(1);
        assertThat((String) job(id).get("last_error")).isEqualTo("IllegalStateException: boom");
        assertThat(runAt(id)).isCloseTo(start.plusSeconds(30), within(1, ChronoUnit.SECONDS));

        worker.runPending();
        assertThat(handler.runs(order)).as("not due yet").isEqualTo(1);

        clock.advance(Duration.ofSeconds(30));
        worker.runPending();
        assertThat(handler.runs(order)).isEqualTo(2);
        assertThat(runAt(id)).isCloseTo(start.plusSeconds(30).plus(Duration.ofMinutes(2)), within(1, ChronoUnit.SECONDS));

        clock.advance(Duration.ofMinutes(2));
        worker.runPending();
        assertThat(handler.runs(order)).isEqualTo(3);
        assertThat(job(id).get("status")).isEqualTo("DEAD");
        assertThat(job(id).get("finished_at")).isNotNull();
        assertThat(handler.givenUp).containsOnlyOnce(order.tag() + ":IllegalStateException: boom");

        clock.advance(Duration.ofHours(1));
        worker.runPending();
        assertThat(handler.runs(order)).isEqualTo(3);
    }

    @Test
    void aPermanentFailureEndsAtOnce() {
        Order order = Order.of("permanent");
        long id = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, order);

        worker.runPending();

        assertThat(job(id).get("status")).isEqualTo("FAILED");
        assertThat((String) job(id).get("last_error")).isEqualTo("JobFailedPermanently: nothing to read");
        assertThat(handler.givenUp).contains(order.tag() + ":JobFailedPermanently: nothing to read");
        assertThat(handler.runs(order)).isEqualTo(1);
    }

    @Test
    void anAttemptOverItsTimeoutCountsAsFailedAndTheNextJobStillRuns() {
        Order slow = new Order(UUID.randomUUID().toString(), "sleep", 5_000);
        Order next = Order.of("ok");
        long slowId = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, slow);
        clock.advance(Duration.ofMillis(1));
        long nextId = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, next);

        long started = System.nanoTime();
        assertThat(worker.runPending()).isEqualTo(2);

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(3));
        assertThat(job(slowId).get("status")).isEqualTo("QUEUED");
        assertThat((String) job(slowId).get("last_error")).isEqualTo("Timed out after 300 ms");
        assertThat(job(nextId).get("status")).isEqualTo("DONE");
    }

    @Test
    void jobsAStoppedProcessLeftRunningAreRecovered() {
        Instant now = clock.instant();
        Order resumable = Order.of("ok");
        Order exhausted = Order.of("ok");
        Order recent = Order.of("ok");
        long resumableId = running(resumable, 1, now.minus(Duration.ofMinutes(6)));
        long exhaustedId = running(exhausted, JobType.AI_TRANSLATE_PASSPORT.maxAttempts(), now.minus(Duration.ofMinutes(6)));
        long recentId = running(recent, 1, now.minus(Duration.ofMinutes(1)));

        worker.runPending();

        assertThat(job(resumableId).get("status")).isEqualTo("DONE");
        assertThat(job(resumableId).get("attempts")).isEqualTo(2);
        assertThat(handler.runs(resumable)).isEqualTo(1);
        assertThat(job(exhaustedId).get("status")).isEqualTo("DEAD");
        assertThat(handler.runs(exhausted)).isZero();
        assertThat(handler.givenUp).contains(exhausted.tag() + ":STOPPED");
        assertThat(job(recentId).get("status")).as("may still be running elsewhere").isEqualTo("RUNNING");
    }

    private long running(Order order, int attempts, Instant lockedAt) {
        Long id = jdbc.queryForObject("""
                INSERT INTO job (type, payload, status, attempts, max_attempts, run_at, locked_at, locked_by)
                VALUES ('AI_TRANSLATE_PASSPORT', CAST(? AS jsonb), 'RUNNING', ?, ?, ?, ?, 'old-process')
                RETURNING id
                """, Long.class, "{\"tag\":\"" + order.tag() + "\",\"mode\":\"ok\",\"sleepMs\":0}", attempts,
                JobType.AI_TRANSLATE_PASSPORT.maxAttempts(), Timestamp.from(lockedAt), Timestamp.from(lockedAt));
        return id == null ? -1 : id;
    }

    @Test
    void anUnreadablePayloadFailsWithoutRunningTheHandler() {
        Long id = jdbc.queryForObject("""
                INSERT INTO job (type, payload, max_attempts, run_at) VALUES ('AI_TRANSLATE_PASSPORT', '[1, 2]'::jsonb, 3, ?)
                RETURNING id
                """, Long.class, Timestamp.from(clock.instant()));

        worker.runPending();

        assertThat(job(id).get("status")).isEqualTo("FAILED");
        assertThat(job(id).get("last_error")).isEqualTo("Unreadable payload");
    }

    @Test
    void jobsWithoutAHandlerHereStayQueued() {
        long id = queue.enqueue(JobType.IMPORT_EXCEL, Map.of("file", "x"));

        worker.runPending();

        assertThat(job(id).get("status")).isEqualTo("QUEUED");
        assertThat(job(id).get("attempts")).isEqualTo(0);
        jdbc.update("UPDATE job SET status = 'DONE' WHERE id = ?", id);
    }

    @Test
    void twoWorkersNeverTakeTheSameJob() throws Exception {
        long id = queue.enqueue(JobType.AI_TRANSLATE_PASSPORT, Order.of("ok"));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Optional<ClaimedJob>>> claims = List.of(
                    pool.submit(() -> {
                        go.await();
                        return store.claim(List.of(JobType.AI_TRANSLATE_PASSPORT), "worker-a", clock.instant());
                    }),
                    pool.submit(() -> {
                        go.await();
                        return store.claim(List.of(JobType.AI_TRANSLATE_PASSPORT), "worker-b", clock.instant());
                    }));
            go.countDown();
            long taken = 0;
            for (Future<Optional<ClaimedJob>> claim : claims) {
                taken += claim.get().filter(j -> j.id() == id).isPresent() ? 1 : 0;
            }

            assertThat(taken).isEqualTo(1);
            assertThat(job(id).get("status")).isEqualTo("RUNNING");
            assertThat(job(id).get("attempts")).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void aRecurringJobIsQueuedOnlyWhenNoneIsRecent() {
        assertThat(queue.enqueueUnlessRecent(JobType.CERT_EXPIRY_SCAN, Map.of(), Duration.ofHours(23))).isTrue();
        assertThat(queue.enqueueUnlessRecent(JobType.CERT_EXPIRY_SCAN, Map.of(), Duration.ofHours(23))).isFalse();

        jdbc.update("UPDATE job SET status = 'DONE' WHERE type = 'CERT_EXPIRY_SCAN'");
        assertThat(queue.enqueueUnlessRecent(JobType.CERT_EXPIRY_SCAN, Map.of(), Duration.ofHours(23)))
                .as("done, but queued within 23 h").isFalse();

        clock.advance(Duration.ofHours(24));
        assertThat(queue.enqueueUnlessRecent(JobType.CERT_EXPIRY_SCAN, Map.of(), Duration.ofHours(23))).isTrue();
        jdbc.update("UPDATE job SET status = 'DONE' WHERE type = 'CERT_EXPIRY_SCAN'");
    }

    /**
     * Render puts the instance to sleep after 15 idle minutes; a retry planned in memory does not survive that. On
     * the next start the worker must take the overdue retry right away (no new failure, no extra wait), and a job
     * queued afterwards must start right after its commit without a poll.
     */
    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void aRetryThatFellDueWhileTheInstanceSleptRunsRightAfterItStarts() throws Exception {
        Order overdue = Order.of("ok");
        Instant failedAt = clock.instant().minus(Duration.ofHours(3));
        Long id = jdbc.queryForObject("""
                INSERT INTO job (type, payload, status, attempts, max_attempts, run_at, last_error, created_at)
                VALUES ('AI_TRANSLATE_PASSPORT', CAST(? AS jsonb), 'QUEUED', 1, 3, ?, 'IllegalStateException: boom', ?)
                RETURNING id
                """, Long.class, json.writeValueAsString(overdue), Timestamp.from(failedAt.plusSeconds(30)),
                Timestamp.from(failedAt));
        JobWorker started = new JobWorker(handlers(), store, json, clock, true);
        try {
            started.start(); // what the ApplicationReadyEvent does on a cold start

            awaitStatus(id, "DONE", Duration.ofSeconds(15));
            assertThat(handler.runs(overdue)).isEqualTo(1);
            assertThat(job(id).get("attempts")).isEqualTo(2);

            Order queuedAwake = Order.of("ok");
            long next = new JobQueue(store, started, json, clock).enqueue(JobType.AI_TRANSLATE_PASSPORT, queuedAwake);
            awaitStatus(next, "DONE", Duration.ofSeconds(3));
        } finally {
            started.stop();
        }
    }

    private void awaitStatus(long id, String status, Duration within) throws InterruptedException {
        long deadline = System.nanoTime() + within.toNanos();
        while (!status.equals(job(id).get("status")) && System.nanoTime() < deadline) {
            Thread.sleep(100);
        }
        assertThat(job(id).get("status")).as("job %d within %s", id, within).isEqualTo(status);
    }

    @Test
    void theBackoffIs30SecondsThen2MinutesThen10Minutes() {
        assertThat(JobWorker.backoff(1)).isEqualTo(Duration.ofSeconds(30));
        assertThat(JobWorker.backoff(2)).isEqualTo(Duration.ofMinutes(2));
        assertThat(JobWorker.backoff(3)).isEqualTo(Duration.ofMinutes(10));
        assertThat(JobWorker.backoff(7)).isEqualTo(Duration.ofMinutes(10));
    }
}
