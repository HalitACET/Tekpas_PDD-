package com.tekpas.batch.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Partial update. A missing field stays as it is; {@code null} clears productionOrderNo and the dates. The
 * product and the status cannot be changed here (such fields are ignored, like any unknown field); the batch
 * number only while the batch is DRAFT.
 */
public record BatchUpdateRequest(
        @Nullable Optional<@NotNull @Pattern(regexp = BatchCreateRequest.BATCH_NO) String> batchNo,
        @Nullable Optional<@Size(max = 50) String> productionOrderNo,
        @Nullable Optional<@NotNull @Positive Integer> quantity,
        @Nullable Optional<LocalDate> producedFrom,
        @Nullable Optional<LocalDate> producedTo) {
}
