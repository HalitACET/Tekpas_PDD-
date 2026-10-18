package com.tekpas.jobs;

import com.tekpas.jobs.JobStore.ClaimedJob;
import jakarta.annotation.PreDestroy;
import java.lang.management.ManagementFactory;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs queued jobs (K9: the job table, {@code FOR UPDATE SKIP LOCKED}) on one background thread, one job at a time:
 * the free Render instance has 0.1 CPU and 512 MB, and a document read must never compete with another.
 *
 * <p><b>No fixed database poll.</b> Neon scales to zero after 5 idle minutes and the free plan has 100 CU-hours a
 * month; a query every few seconds would keep it awake whenever Render is (about 410 hours, more than the whole
 * budget). The worker therefore touches the database only when there is a reason: right after a job is queued
 * (woken after the commit), at the time the next retry is due (planned in memory after each run), once after
 * startup (recovery of jobs a stopped process left RUNNING) and for recurring jobs ({@link #every}, daily).
 *
 * <p>Retries: 30 s, 2 min, then 10 min after the failed attempt, up to {@link JobType#maxAttempts()}. An attempt
 * longer than {@link JobHandler#timeout()} counts as failed; the stuck thread is abandoned and a fresh one runs the
 * next job.
 */
@Component
public class JobWorker {

    private static final Logger log = LoggerFactory.getLogger(JobWorker.class);

    /** A RUNNING job older than this belongs to a process that stopped (attempt timeouts are far shorter). */
    static final Duration STALE_AFTER = Duration.ofMinutes(5);
    /** Jobs per run before the thread yields to other scheduled work. */
    static final int MAX_PER_RUN = 20;
    static final Duration FIRST_RUN_DELAY = Duration.ofSeconds(5);
    /** When the database cannot be reached, try again this much later. */
    static final Duration ERROR_PAUSE = Duration.ofMinutes(1);

    private final ObjectProvider<JobHandler<?>> handlerBeans;
    private volatile @Nullable Map<JobType, JobHandler<?>> handlers;
    private final JobStore store;
    private final ObjectMapper json;
    private final Clock clock;
    private final boolean enabled;
    private final String workerId;
    private final ReentrantLock runLock = new ReentrantLock();
    private final AtomicBoolean wakeQueued = new AtomicBoolean();
    private final @Nullable ScheduledExecutorService scheduler;
    private ExecutorService runner;
    private @Nullable ScheduledFuture<?> plannedWake;

    /** Handlers are looked up on first use: they may themselves depend on the queue, which depends on this. */
    JobWorker(ObjectProvider<JobHandler<?>> handlerBeans, JobStore store, ObjectMapper json, Clock clock,
            @Value("${tekpas.jobs.worker-enabled:true}") boolean enabled) {
        this.handlerBeans = handlerBeans;
        this.store = store;
        this.json = json;
        this.clock = clock;
        this.enabled = enabled;
        this.workerId = truncate(ManagementFactory.getRuntimeMXBean().getName(), 100);
        this.runner = newRunner();
        this.scheduler = enabled ? Executors.newSingleThreadScheduledExecutor(daemon("job-worker")) : null;
    }

    @EventListener(ApplicationReadyEvent.class)
    void start() {
        if (scheduler != null) {
            plan(clock.instant().plus(FIRST_RUN_DELAY));
            log.info("Job worker started for {}", handlers().keySet());
        }
    }

    /** Runs due jobs soon, on the worker thread. Repeated calls before it runs collapse into one. */
    public void wake() {
        if (scheduler != null && wakeQueued.compareAndSet(false, true)) {
            scheduler.execute(() -> {
                wakeQueued.set(false);
                scheduledRun();
            });
        }
    }

    /** Runs {@code task} on the worker thread every {@code period}, the first time after {@code initialDelay}. */
    public void every(Duration period, Duration initialDelay, Runnable task) {
        if (scheduler != null) {
            scheduler.scheduleWithFixedDelay(() -> {
                try {
                    task.run();
                } catch (RuntimeException e) {
                    log.warn("Recurring job task failed: {}", e.toString());
                }
            }, initialDelay.toMillis(), period.toMillis(), TimeUnit.MILLISECONDS);
        }
    }

    /**
     * Recovers stale jobs, then runs due jobs (at most {@link #MAX_PER_RUN}) and plans the next run. Called on the
     * worker thread; tests, where the thread is off ({@code tekpas.jobs.worker-enabled=false}), call it directly.
     *
     * @return how many jobs ran
     */
    public int runPending() {
        runLock.lock();
        try {
            Instant now = clock.instant();
            for (ClaimedJob dead : store.recoverStale(now.minus(STALE_AFTER), now)) {
                log.error("Job {} ({}) gave up: its last attempt never finished", dead.id(), dead.type());
                giveUp(dead, "STOPPED");
            }
            int ran = 0;
            while (ran < MAX_PER_RUN) {
                Optional<ClaimedJob> job = store.claim(handlers().keySet(), workerId, clock.instant());
                if (job.isEmpty()) {
                    break;
                }
                execute(job.get());
                ran++;
            }
            if (ran == MAX_PER_RUN) {
                wake();
            } else {
                store.nextRunAt(handlers().keySet()).ifPresent(this::plan);
            }
            return ran;
        } finally {
            runLock.unlock();
        }
    }

    private void scheduledRun() {
        try {
            runPending();
        } catch (RuntimeException e) {
            log.warn("Job worker could not run, trying again in {}: {}", ERROR_PAUSE, e.toString());
            plan(clock.instant().plus(ERROR_PAUSE));
        }
    }

    /** Keeps the earliest planned wake-up only. */
    private synchronized void plan(Instant at) {
        if (scheduler == null) {
            return;
        }
        long delay = Math.max(0, Duration.between(clock.instant(), at).toMillis());
        if (plannedWake != null && !plannedWake.isDone()) {
            if (plannedWake.getDelay(TimeUnit.MILLISECONDS) <= delay) {
                return;
            }
            plannedWake.cancel(false);
        }
        plannedWake = scheduler.schedule(this::scheduledRun, delay, TimeUnit.MILLISECONDS);
    }

    @SuppressWarnings("unchecked")
    private <P> void execute(ClaimedJob job) {
        JobHandler<P> handler = (JobHandler<P>) handlers().get(job.type());
        P payload;
        try {
            payload = json.readValue(job.payload(), handler.payloadType());
        } catch (RuntimeException e) {
            log.error("Job {} ({}) has an unreadable payload", job.id(), job.type());
            store.end(job.id(), "FAILED", "Unreadable payload", clock.instant());
            return;
        }
        JobContext context = new JobContext(job.id(), job.attempt(), job.maxAttempts());
        Future<?> attempt = runner.submit(() -> {
            handler.handle(payload, context);
            return null;
        });
        try {
            attempt.get(handler.timeout().toMillis(), TimeUnit.MILLISECONDS);
            store.complete(job.id(), clock.instant());
        } catch (TimeoutException e) {
            attempt.cancel(true);
            // The thread may not stop (e.g. a parser that ignores interrupts): leave it, take a new one.
            runner.shutdownNow();
            runner = newRunner();
            failed(job, handler, payload, "Timed out after " + handler.timeout().toMillis() + " ms", false);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            failed(job, handler, payload, describe(cause), cause instanceof JobFailedPermanently);
        } catch (InterruptedException e) {
            attempt.cancel(true);
            Thread.currentThread().interrupt();
            store.retry(job.id(), clock.instant(), "Interrupted (shutdown)");
        }
    }

    private <P> void failed(ClaimedJob job, JobHandler<P> handler, P payload, String error, boolean permanent) {
        Instant now = clock.instant();
        if (permanent || job.attempt() >= job.maxAttempts()) {
            String status = permanent ? "FAILED" : "DEAD";
            log.error("Job {} ({}) {} after attempt {}/{}: {}", job.id(), job.type(), status, job.attempt(),
                    job.maxAttempts(), error);
            store.end(job.id(), status, error, now);
            onGiveUp(handler, payload, error);
        } else {
            Instant next = now.plus(backoff(job.attempt()));
            log.warn("Job {} ({}) attempt {}/{} failed, retrying at {}: {}", job.id(), job.type(), job.attempt(),
                    job.maxAttempts(), next, error);
            store.retry(job.id(), next, error);
        }
    }

    /** 30 s after the first failed attempt, 2 min after the second, 10 min after any later one. */
    static Duration backoff(int failedAttempt) {
        return switch (failedAttempt) {
            case 1 -> Duration.ofSeconds(30);
            case 2 -> Duration.ofMinutes(2);
            default -> Duration.ofMinutes(10);
        };
    }

    @SuppressWarnings("unchecked")
    private <P> void giveUp(ClaimedJob job, String reason) {
        JobHandler<P> handler = (JobHandler<P>) handlers().get(job.type());
        if (handler == null) {
            return;
        }
        try {
            onGiveUp(handler, json.readValue(job.payload(), handler.payloadType()), reason);
        } catch (RuntimeException e) {
            log.warn("Job {} ({}) has an unreadable payload", job.id(), job.type());
        }
    }

    private static <P> void onGiveUp(JobHandler<P> handler, P payload, String reason) {
        try {
            handler.onGiveUp(payload, reason);
        } catch (RuntimeException e) {
            log.warn("onGiveUp of {} failed: {}", handler.type(), e.toString());
        }
    }

    private Map<JobType, JobHandler<?>> handlers() {
        Map<JobType, JobHandler<?>> known = handlers;
        if (known == null) {
            known = new EnumMap<>(JobType.class);
            for (JobHandler<?> handler : handlerBeans.orderedStream().toList()) {
                if (known.put(handler.type(), handler) != null) {
                    throw new IllegalStateException("Two handlers for job type " + handler.type());
                }
            }
            handlers = known;
        }
        return known;
    }

    private static String describe(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null ? "" : ": " + message);
    }

    private static ExecutorService newRunner() {
        return Executors.newSingleThreadExecutor(daemon("job-runner"));
    }

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> {
            Thread thread = new Thread(r, name);
            thread.setDaemon(true);
            return thread;
        };
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }

    @PreDestroy
    void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        runner.shutdownNow();
    }
}
