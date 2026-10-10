package com.tekpas.batch.dto;

import com.tekpas.supplychain.StepStatus;
import java.util.List;

/**
 * Supply chain progress: steps in total, how many are approved, and every step's status in chain order
 * (step type, then position), for the list's per-step bar (design v0.3.1 22).
 */
public record ChainSummary(int totalSteps, int approvedSteps, List<StepStatus> stepStatuses) {

    public ChainSummary {
        stepStatuses = List.copyOf(stepStatuses);
    }

    public static ChainSummary of(List<StepStatus> statuses) {
        int approved = (int) statuses.stream().filter(s -> s == StepStatus.APPROVED).count();
        return new ChainSummary(statuses.size(), approved, statuses);
    }
}
