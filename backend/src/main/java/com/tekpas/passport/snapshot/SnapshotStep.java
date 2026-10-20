package com.tekpas.passport.snapshot;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.tekpas.supplychain.StepType;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One step of the chain. {@code key} is opaque ("s1", "s2"…, chain order), never a database id; {@code inputs} and
 * {@code certificates} refer to keys. A published passport has only approved steps; a preview also shows the ones
 * that are not (approved false, no data, no certificates).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SnapshotStep(String key, StepType type, boolean approved, @Nullable Instant approvedAt,
        List<String> inputs, @Nullable SnapshotActor actor, @Nullable SnapshotStepData data,
        List<String> certificates) {

    public SnapshotStep {
        inputs = List.copyOf(inputs);
        certificates = List.copyOf(certificates);
    }
}
