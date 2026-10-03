package com.tekpas.product;

import io.swagger.v3.oas.annotations.media.Schema;

/** Same list as the V3 check constraint and packages/shared (PRODUCT_CATEGORIES). */
@Schema(enumAsRef = true)
public enum ProductCategory {
    T_SHIRT,
    SHIRT,
    TROUSERS,
    DRESS,
    KNITWEAR,
    SWEATSHIRT,
    OUTERWEAR,
    BABY,
    HOME_TEXTILE,
    FABRIC,
    OTHER
}
