package com.tekpas.batch.dto;

/** Supply chain progress: steps in total and how many are approved. 0/0 until a chain is built (M3). */
public record ChainSummary(int totalSteps, int approvedSteps) {
}
