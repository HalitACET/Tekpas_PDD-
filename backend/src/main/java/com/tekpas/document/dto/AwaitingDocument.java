package com.tekpas.document.dto;

import com.tekpas.batch.BatchStatus;
import com.tekpas.document.DocType;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.supplychain.StepType;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A document whose reading is over and that waits for a person to confirm it (the mobile Görevlerim, M8): where it
 * belongs and how the reading went. {@code proposedFields} counts the values the reading proposes, {@code lowConfidence}
 * those under 0.8 (shown yellow).
 */
public record AwaitingDocument(
        UUID id,
        DocType docType,
        String originalName,
        ExtractionStatus extractionStatus,
        @Nullable ExtractionMethod extractionMethod,
        int proposedFields,
        int lowConfidence,
        @Nullable String uploadedByName,
        Instant createdAt,
        UUID stepId,
        StepType stepType,
        @Nullable String supplierName,
        UUID batchId,
        String batchNo,
        BatchStatus batchStatus) {
}
