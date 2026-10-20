package com.tekpas.validation;

import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.jobs.JobWorker;
import java.time.Duration;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Queues {@code CERT_EXPIRY_SCAN} once a day, the first time 15 minutes after startup (like the document cleanup: the
 * instance is awake when a request woke it, and no poll keeps the database awake, PLAN K9).
 */
@Component
class CertificateExpirySchedule {

    private final JobWorker worker;
    private final JobQueue queue;

    CertificateExpirySchedule(JobWorker worker, JobQueue queue) {
        this.worker = worker;
        this.queue = queue;
    }

    @EventListener(ApplicationReadyEvent.class)
    void schedule() {
        worker.every(Duration.ofHours(24), Duration.ofMinutes(15), () -> queue.enqueueUnlessRecent(
                JobType.CERT_EXPIRY_SCAN, new CertificateExpiryScanJob.Payload(), Duration.ofHours(23)));
    }
}
