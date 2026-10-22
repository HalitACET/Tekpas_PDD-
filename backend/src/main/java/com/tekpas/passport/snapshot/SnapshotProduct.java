package com.tekpas.passport.snapshot;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.product.care.CareInfo;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The product as declared on its label. Free text stays in its own language; the category is a code.
 *
 * @param care care instructions as symbol codes and the note in its own language (schemaVersion 2); null in a
 *     version 1 snapshot or when the product has none, and the page then shows no care section
 */
public record SnapshotProduct(String name, ProductCategory category, @Nullable String description,
        @Nullable List<FiberShare> fiberComposition, @Nullable CareInfo care) {
}
