package com.tekpas.notification;

import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Queues the notifications of an event in the event's transaction (docs/m9-plan.md §4.3): rolled back with it, sent
 * by {@code PUSH_NOTIFY} after the commit. Who gets what is decided when the job runs.
 */
@Component
public class PushNotifications {

    private final JobQueue jobs;

    PushNotifications(JobQueue jobs) {
        this.jobs = jobs;
    }

    public void stepSubmitted(UUID stepId) {
        jobs.enqueue(JobType.PUSH_NOTIFY, PushNotifyJob.Payload.stepSubmitted(stepId));
    }

    public void certificatesExpiring(UUID companyId, int count) {
        jobs.enqueue(JobType.PUSH_NOTIFY, PushNotifyJob.Payload.certificatesExpiring(companyId, count));
    }
}
