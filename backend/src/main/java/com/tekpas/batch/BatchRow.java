package com.tekpas.batch;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** A batch with its product's name and GTIN, as read for lists and detail. */
public record BatchRow(
        UUID id,
        String batchNo,
        UUID productId,
        String productName,
        String gtin,
        @Nullable String productionOrderNo,
        BatchStatus status,
        int quantity,
        @Nullable LocalDate producedFrom,
        @Nullable LocalDate producedTo,
        Instant createdAt,
        Instant updatedAt) {
}
