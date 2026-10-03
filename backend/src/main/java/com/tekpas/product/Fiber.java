package com.tekpas.product;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Fiber codes of a declared composition, in the order of the design's select (v0.3) with the rest after it.
 * Same list in packages/shared (FIBERS).
 */
@Schema(enumAsRef = true)
public enum Fiber {
    COTTON,
    ORGANIC_COTTON,
    ELASTANE,
    POLYESTER,
    RECYCLED_POLYESTER,
    LINEN,
    WOOL,
    VISCOSE,
    POLYAMIDE,
    LYOCELL,
    RECYCLED_COTTON,
    SILK,
    OTHER
}
