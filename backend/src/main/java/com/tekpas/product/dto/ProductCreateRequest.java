package com.tekpas.product.dto;

import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.product.validation.FiberDuplicate;
import com.tekpas.product.validation.FiberTotal;
import com.tekpas.product.validation.GtinCheckDigit;
import com.tekpas.product.validation.GtinFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * @param gtin GTIN-8, -12, -13 or -14; stored and returned as 14 digits
 * @param declaredFiberComposition whole percentages that add up to 100, each fiber at most once
 */
public record ProductCreateRequest(
        @Schema(example = "02012345000018") @NotNull @GtinFormat @GtinCheckDigit String gtin,
        @Nullable @Size(max = 64) String sku,
        @NotBlank @Size(max = 200) String name,
        @NotNull ProductCategory category,
        @Nullable @Size(max = 2000) String description,
        @Nullable @Valid @FiberTotal @FiberDuplicate List<FiberShare> declaredFiberComposition) {
}
