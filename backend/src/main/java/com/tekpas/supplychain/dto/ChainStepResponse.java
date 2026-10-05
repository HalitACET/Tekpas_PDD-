package com.tekpas.supplychain.dto;

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
 * @param documentCount documents attached to the step; 0 until M5
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
        @Nullable Instant submittedAt,
        Instant updatedAt) {
}
