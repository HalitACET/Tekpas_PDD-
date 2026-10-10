package com.tekpas.request.dto;

import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepType;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Everything the link holder sees (design v0.4 39–41, 45): their own step only. Never the rest of the chain,
 * other suppliers, step ids, GTIN or quantity.
 *
 * @param requesterName the contact on the page (name only, 39)
 * @param data the step's current data: empty for a first request, the previous submission after a correction
 * @param rejection set when the manufacturer asked for a correction
 */
public record PublicRequestView(String code, String manufacturerName, String requesterName, String productName,
        String batchNo, StepType stepType, Instant expiresAt, StepData data, @Nullable PublicRejection rejection) {
}
