package com.tekpas.supplychain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Spinning process (design 10: "Ne 30/1 penye", "Ne 30/1 karde"). */
@Schema(enumAsRef = true)
public enum YarnProcess {
    COMBED,
    CARDED,
    OPEN_END,
    OTHER
}
