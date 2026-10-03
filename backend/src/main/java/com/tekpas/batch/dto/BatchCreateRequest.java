package com.tekpas.batch.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * @param productId a product of the current company (otherwise 404)
 * @param batchNo GS1 AI(10): up to 20 of A–Z, 0–9 and '-', unique within the product. Empty or missing: the
 *     next {@code KP-YYYY-MMDD-A} number of the day is assigned
 * @param producedTo not before producedFrom
 */
public record BatchCreateRequest(
        @NotNull UUID productId,
        @Schema(example = "KP-2026-1003-A") @Nullable @Pattern(regexp = BatchCreateRequest.BATCH_NO_OR_EMPTY)
        String batchNo,
        @Nullable @Size(max = 50) String productionOrderNo,
        @NotNull @Positive Integer quantity,
        @Nullable LocalDate producedFrom,
        @Nullable LocalDate producedTo) {

    public static final String BATCH_NO = "^[A-Z0-9-]{1,20}$";
    static final String BATCH_NO_OR_EMPTY = "^[A-Z0-9-]{0,20}$";
}
