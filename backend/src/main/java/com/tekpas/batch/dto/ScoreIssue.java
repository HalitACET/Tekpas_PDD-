package com.tekpas.batch.dto;

import com.tekpas.batch.ScoreIssueCode;
import com.tekpas.document.DocType;
import com.tekpas.supplychain.StepType;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A blocker or a warning. Which of the optional fields are set depends on the code: the step for
 * STEP_NOT_APPROVED, step and document type and the end of validity for the certificate codes, the number of
 * documents for UNREVIEWED_DOCUMENTS.
 */
public record ScoreIssue(
        ScoreIssueCode code,
        @Nullable UUID stepId,
        @Nullable StepType stepType,
        @Nullable DocType docType,
        @Nullable LocalDate validUntil,
        @Nullable Integer count) {
}
