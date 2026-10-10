package com.tekpas.supplychain;

import com.tekpas.batch.BatchProgress;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import com.tekpas.supplychain.dto.StepRejectRequest;
import java.time.Clock;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The manufacturer's review of submitted data (design v0.4 47a/b): approve, or reject with a reason and the
 * fields to correct. A rejected step gets a new link (46); the old one was used up by the submission.
 */
@Service
public class StepReviewService {

    private final SupplyStepRepository steps;
    private final BatchProgress progress;
    private final StepEvents events;
    private final Clock clock;

    public StepReviewService(SupplyStepRepository steps, BatchProgress progress, StepEvents events, Clock clock) {
        this.steps = steps;
        this.progress = progress;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public UUID approve(UUID companyId, UUID userId, UUID stepId) {
        SupplyStep step = submitted(companyId, stepId);
        step.approve(userId, clock.instant());
        events.record(stepId, null, StepEventKind.APPROVED, userId, null, null);
        progress.refresh(step.getBatchId());
        return step.getBatchId();
    }

    @Transactional
    public UUID reject(UUID companyId, UUID userId, UUID stepId, StepRejectRequest request) {
        SupplyStep step = submitted(companyId, stepId);
        List<String> allowed = StepData.fieldsOf(step.getStepType());
        List<String> fields = List.copyOf(new LinkedHashSet<>(request.fields() == null ? List.of() : request.fields()));
        List<FieldViolation> unknown = fields.stream().filter(f -> !allowed.contains(f))
                .map(f -> new FieldViolation("fields", "NotApplicable", f + " is not a field of a "
                        + step.getStepType() + " step", Map.of("field", f)))
                .toList();
        if (!unknown.isEmpty()) {
            throw new InvalidFieldsException(unknown.toArray(FieldViolation[]::new));
        }
        step.reject(userId, request.reason().trim(), fields, clock.instant());
        events.record(stepId, null, StepEventKind.REJECTED, userId, null, Map.of("fields", fields));
        progress.refresh(step.getBatchId());
        return step.getBatchId();
    }

    private SupplyStep submitted(UUID companyId, UUID stepId) {
        SupplyStep step = steps.lockForUpdate(stepId, companyId)
                .orElseThrow(() -> new NotFoundException("Step not found"));
        if (step.getStatus() != StepStatus.SUBMITTED) {
            throw ConflictException.state("STEP_NOT_SUBMITTED", "Only submitted data can be approved or rejected");
        }
        return step;
    }
}
