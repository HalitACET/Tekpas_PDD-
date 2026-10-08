package com.tekpas.supplychain.dto;

import com.tekpas.supplychain.StepType;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * @param supplierId a supplier of the company's network whose type fits the step (not for FIBER)
 * @param inputStepIds steps of the same batch whose output the new step uses
 * @param outputStepIds steps of the same batch that use the new step's output
 */
public record StepCreateRequest(
        @NotNull StepType stepType,
        @Nullable UUID supplierId,
        @Nullable List<@NotNull UUID> inputStepIds,
        @Nullable List<@NotNull UUID> outputStepIds) {
}
