package com.tekpas.validation;

import com.tekpas.ai.AiProperties;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * {@code AI_VALIDATE_BATCH}: the AI checks of one batch, queued by a rule check when the LLM gate opens for its
 * company. Idempotent: an unchanged batch is not sent again, a deleted one is nothing to do.
 */
@Component
class AiValidateBatchJob implements JobHandler<AiValidateBatchJob.Payload> {

    private static final Duration BASE_TIMEOUT = Duration.ofSeconds(30);

    record Payload(UUID companyId, UUID batchId) {
    }

    private final AiValidationService service;
    private final Duration timeout;

    AiValidateBatchJob(AiValidationService service, AiProperties ai) {
        this.service = service;
        this.timeout = BASE_TIMEOUT.plus(ai.gemini().timeout());
    }

    @Override
    public JobType type() {
        return JobType.AI_VALIDATE_BATCH;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        return timeout;
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        service.run(payload.companyId(), payload.batchId(), context);
    }
}
