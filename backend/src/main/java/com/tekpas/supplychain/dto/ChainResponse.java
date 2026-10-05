package com.tekpas.supplychain.dto;

import com.tekpas.batch.dto.ChainSummary;
import com.tekpas.supplychain.StepType;
import java.util.List;
import java.util.UUID;

/**
 * A batch's supply chain as a DAG: the steps, each with the ids of the steps whose output it uses.
 *
 * @param unassignedStepTypes types of steps without a supplier (FIBER excluded: it has no supplier), e.g. the
 *     design's "Konfeksiyon adımına tedarikçi atanmadı"
 */
public record ChainResponse(UUID batchId, List<ChainStepResponse> steps, ChainSummary summary,
        List<StepType> unassignedStepTypes) {
}
