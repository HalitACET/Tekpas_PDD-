package com.tekpas.document;

import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import java.time.Duration;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Queues {@code DOCUMENT_CLEANUP} once a day, the first time 10 minutes after startup (Render wakes the instance
 * for a request, so the database is awake then anyway). One query a day at most: Neon may sleep in between.
 */
@Component
class DocumentCleanupSchedule {

    private final JobWorker worker;
    private final JobQueue queue;

    DocumentCleanupSchedule(JobWorker worker, JobQueue queue) {
        this.worker = worker;
        this.queue = queue;
    }

    @EventListener(ApplicationReadyEvent.class)
    void schedule() {
        worker.every(Duration.ofHours(24), Duration.ofMinutes(10), () -> queue.enqueueUnlessRecent(
                JobType.DOCUMENT_CLEANUP, new DocumentCleanupJob.Payload(), Duration.ofHours(23)));
    }
}
