package com.tekpas.validation;

import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** {@code RULE_VALIDATE_BATCH}: runs the rules of one batch. Idempotent; a batch deleted meanwhile is nothing to do. */
@Component
class ValidateBatchJob implements JobHandler<ValidateBatchJob.Payload> {

    record Payload(UUID companyId, UUID batchId) {
    }

    private final ValidationService service;

    ValidateBatchJob(ValidationService service) {
        this.service = service;
    }

    @Override
    public JobType type() {
        return JobType.RULE_VALIDATE_BATCH;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        service.checkIfExists(payload.companyId(), payload.batchId());
    }
}
