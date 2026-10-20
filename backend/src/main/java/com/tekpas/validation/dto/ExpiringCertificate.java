package com.tekpas.validation.dto;

import com.tekpas.batch.BatchStatus;
import com.tekpas.document.DocType;
import com.tekpas.supplychain.StepType;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A confirmed certificate that ends soon or has ended, with where it is used (the Görevler page group "Süresi yaklaşan
 * sertifikalar"). {@code daysLeft} counts from today (Istanbul) to the last valid day; negative once it ended.
 */
public record ExpiringCertificate(
        UUID documentId,
        DocType docType,
        LocalDate validUntil,
        int daysLeft,
        @Nullable String holderName,
        UUID stepId,
        StepType stepType,
        @Nullable UUID supplierId,
        @Nullable String supplierName,
        UUID batchId,
        String batchNo,
        BatchStatus batchStatus) {
}
