package com.tekpas.supplychain.dto;

import java.time.Instant;
import java.util.List;

/** The correction the manufacturer asked for (design v0.4 47b), while the step is REJECTED. */
public record StepRejection(String reason, List<String> fields, Instant at) {
}
