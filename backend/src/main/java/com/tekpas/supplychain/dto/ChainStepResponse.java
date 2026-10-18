package com.tekpas.supplychain.dto;

import com.tekpas.request.dto.DataRequestSummary;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One node of the chain.
 *
 * @param supplier null while unassigned (the design's dashed "Tedarikçi ata" node) and always for FIBER
 * @param sortOrder order within the step type's column
 * @param inputStepIds steps whose output this step uses (edges come in from these)
 * @param documentCount documents attached to the step (panel and link uploads)
 * @param unreviewedDocumentCount of those, how many nobody confirmed yet (the dot on the node, design v0.5 B4)
 * @param request the step's latest data request link (no token), if any
 * @param submission the last data the supplier sent, if any
 * @param rejection the correction asked for, while the step is REJECTED
 */
public record ChainStepResponse(
        UUID id,
        StepType stepType,
        StepStatus status,
        @Nullable StepSupplier supplier,
        int sortOrder,
        List<UUID> inputStepIds,
        StepData data,
        int documentCount,
        int unreviewedDocumentCount,
        @Nullable Instant submittedAt,
        Instant updatedAt,
        @Nullable DataRequestSummary request,
        @Nullable StepSubmission submission,
        @Nullable StepRejection rejection,
        @Nullable Instant approvedAt) {
}
