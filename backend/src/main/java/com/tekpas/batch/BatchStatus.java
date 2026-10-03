package com.tekpas.batch;

import io.swagger.v3.oas.annotations.media.Schema;

/** A new batch is DRAFT; the supply chain and publishing flows (M3+) move it on. Not changeable by PATCH. */
@Schema(enumAsRef = true)
public enum BatchStatus {
    DRAFT,
    COLLECTING,
    READY,
    PUBLISHED
}
