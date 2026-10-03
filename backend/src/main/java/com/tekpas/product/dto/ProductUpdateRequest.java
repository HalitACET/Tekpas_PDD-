package com.tekpas.product.dto;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.product.validation.FiberDuplicate;
import com.tekpas.product.validation.FiberTotal;
import com.tekpas.product.validation.GtinCheckDigit;
import com.tekpas.product.validation.GtinFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Partial update. A missing field stays as it is; {@code null} clears sku, description and
 * declaredFiberComposition (and is rejected for the required fields). Unknown fields (e.g. companyId) are
 * ignored, as everywhere in the API.
 * The GTIN cannot change once the product has batches (409 gtin-locked): printed QR codes contain it.
 */
public record ProductUpdateRequest(
        @Nullable Optional<@NotNull @GtinFormat @GtinCheckDigit String> gtin,
        @Nullable Optional<@Size(max = 60) String> sku,
        @Nullable Optional<@NotBlank @Size(max = 200) String> name,
        @Nullable Optional<@NotNull ProductCategory> category,
        @Nullable Optional<@Size(max = 2000) String> description,
        @Nullable Optional<@Valid @FiberTotal @FiberDuplicate List<FiberShare>> declaredFiberComposition) {
}
