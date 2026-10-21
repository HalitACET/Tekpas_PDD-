package com.tekpas.validation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.tekpas.document.DocType;
import com.tekpas.supplychain.StepType;
import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * One quote an AI suggestion rests on, and where it is from: the product, a step's declaration or a confirmed
 * document. The server found the quote in that source before it kept the suggestion; the card shows it as a box.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record IssueEvidence(Source source, @Nullable StepType stepType, @Nullable DocType docType,
        @Nullable String supplier, String quote) {

    @Schema(name = "EvidenceSource", enumAsRef = true)
    public enum Source {
        PRODUCT, STEP, DOCUMENT
    }
}
