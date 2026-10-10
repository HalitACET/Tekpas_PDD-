package com.tekpas.supplychain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Dyeing process (design v0.4 41, "İşlem"); OTHER needs {@code dyeProcessOther}. */
@Schema(enumAsRef = true)
public enum DyeProcess {
    REACTIVE,
    DISPERSE,
    VAT,
    PIGMENT,
    OTHER
}
