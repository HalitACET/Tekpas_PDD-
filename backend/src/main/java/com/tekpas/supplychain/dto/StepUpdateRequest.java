package com.tekpas.supplychain.dto;

import com.tekpas.supplychain.StepData;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Partial update. A missing field stays as it is; {@code supplierId: null} unassigns the supplier,
 * {@code data: null} clears the data, {@code inputStepIds} replaces the step's inputs.
 */
public record StepUpdateRequest(
        @Nullable Optional<UUID> supplierId,
        @Nullable Optional<@Valid StepData> data,
        @Nullable Optional<@NotNull List<@NotNull UUID>> inputStepIds) {
}
