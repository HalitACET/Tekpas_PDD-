package com.tekpas.supplychain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Chemical compliance of a dyehouse (design v0.4 41, "Kimyasal uyumu", all that apply). NONE is an explicit
 * "none of these" and cannot be combined with the others.
 */
@Schema(enumAsRef = true)
public enum ChemicalStandard {
    ZDHC_MRSL,
    OEKO_TEX_ECO_PASSPORT,
    BLUESIGN,
    GOTS_APPROVED,
    NONE
}
