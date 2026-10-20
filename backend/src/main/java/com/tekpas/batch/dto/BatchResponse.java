package com.tekpas.batch.dto;

import com.tekpas.batch.BatchStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** A batch, as listed and in detail. */
public record BatchResponse(
        UUID id,
        String batchNo,
        BatchProduct product,
        @Nullable String productionOrderNo,
        BatchStatus status,
        int quantity,
        @Nullable LocalDate producedFrom,
        @Nullable LocalDate producedTo,
        ChainSummary chain,
        @Schema(description = "Compliance score 0–100 (docs/m6-plan.md §2); GET /batches/{id}/score tells how it adds up")
        int score,
        Instant createdAt,
        Instant updatedAt) {
}
