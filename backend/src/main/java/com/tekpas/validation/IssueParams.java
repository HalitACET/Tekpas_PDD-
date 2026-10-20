package com.tekpas.validation;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.tekpas.document.DocType;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import java.time.LocalDate;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * What a card fills its sentence and its comparison boxes with, as typed optional fields (one record for all
 * codes, like StepData): LIF-01 label, declared and the differing fibres; LIF-02 the composition and its total;
 * SER-* the document type, its end of validity and the two names; BEL-01 the file name; EKS-02 which date is missing.
 * Never the days left: those change every day and are worked out where they are shown.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record IssueParams(
        @Nullable List<FiberShare> label,
        @Nullable List<FiberShare> declared,
        @Nullable List<Fiber> differing,
        @Nullable Integer total,
        @Nullable DocType docType,
        @Nullable LocalDate validUntil,
        @Nullable String holder,
        @Nullable String supplier,
        @Nullable String fileName,
        @Nullable String missing) {

    public static final IssueParams EMPTY = new IssueParams(null, null, null, null, null, null, null, null, null, null);

    public static IssueParams ofDocument(DocType type, @Nullable LocalDate validUntil) {
        return new IssueParams(null, null, null, null, type, validUntil, null, null, null, null);
    }
}
