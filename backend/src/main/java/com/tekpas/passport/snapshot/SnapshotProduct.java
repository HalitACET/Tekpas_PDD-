package com.tekpas.passport.snapshot;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** The product as declared on its label. Free text stays in its own language; the category is a code. */
public record SnapshotProduct(String name, ProductCategory category, @Nullable String description,
        @Nullable List<FiberShare> fiberComposition) {
}
