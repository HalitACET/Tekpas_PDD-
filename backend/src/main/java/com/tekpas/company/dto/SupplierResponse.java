package com.tekpas.company.dto;

import com.tekpas.company.CompanyType;
import com.tekpas.supplychain.StepStatus;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A supplier in the current company's network (design 14).
 *
 * @param batchCount batches of the current company with this supplier in their chain
 * @param latestStepStatus status of the supplier's most recently changed step there; null without steps
 * @param editable whether name, type and city can change (created by the current company, no users)
 * @param linkedAt when the supplier was added to the network
 */
public record SupplierResponse(
        UUID id,
        String name,
        CompanyType type,
        @Nullable String city,
        @Nullable String phone,
        long batchCount,
        @Nullable StepStatus latestStepStatus,
        boolean editable,
        Instant linkedAt) {
}
