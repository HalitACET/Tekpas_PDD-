package com.tekpas.product.dto;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.product.care.CareInfo;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * @param gtin always 14 digits
 * @param publishedBatchCount batches with a published passport: a change of the care instructions reaches them
 *     only with their next version (design v1.0 120c)
 */
public record ProductResponse(
        UUID id,
        String gtin,
        @Nullable String sku,
        String name,
        ProductCategory category,
        @Nullable String description,
        @Nullable List<FiberShare> declaredFiberComposition,
        @Nullable CareInfo careInfo,
        long batchCount,
        long publishedBatchCount,
        Instant createdAt,
        Instant updatedAt) {
}
