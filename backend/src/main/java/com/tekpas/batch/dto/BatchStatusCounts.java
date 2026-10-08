package com.tekpas.batch.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.v3.oas.annotations.media.Schema;

/** Batches of the company per status, every status present (0 when none), for the list's tabs. */
@Schema(description = "Batch count per status; all is the sum")
public record BatchStatusCounts(
        long all,
        @JsonProperty("DRAFT") long draft,
        @JsonProperty("COLLECTING") long collecting,
        @JsonProperty("READY") long ready,
        @JsonProperty("PUBLISHED") long published) {
}
