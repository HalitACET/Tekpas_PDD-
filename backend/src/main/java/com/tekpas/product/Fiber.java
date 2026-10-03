package com.tekpas.product;

import io.swagger.v3.oas.annotations.media.Schema;

/** Fiber codes of a declared composition. Same list in packages/shared (FIBERS). */
@Schema(enumAsRef = true)
public enum Fiber {
    COTTON,
    ORGANIC_COTTON,
    RECYCLED_COTTON,
    POLYESTER,
    RECYCLED_POLYESTER,
    ELASTANE,
    VISCOSE,
    LINEN,
    WOOL,
    SILK,
    POLYAMIDE,
    OTHER
}
