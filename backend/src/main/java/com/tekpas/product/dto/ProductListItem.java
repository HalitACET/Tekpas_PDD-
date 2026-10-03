package com.tekpas.product.dto;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** One row of the product list. */
public record ProductListItem(
        UUID id,
        String gtin,
        @Nullable String sku,
        String name,
        ProductCategory category,
        @Nullable List<FiberShare> declaredFiberComposition,
        long batchCount,
        Instant createdAt,
        Instant updatedAt) {
}
