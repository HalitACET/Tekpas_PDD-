package com.tekpas.batch.dto;

import com.tekpas.batch.BatchStatus;
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
        Instant createdAt,
        Instant updatedAt) {
}
