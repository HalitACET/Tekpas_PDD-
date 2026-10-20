package com.tekpas.batch.dto;

import com.tekpas.batch.ScoreItemCode;
import com.tekpas.supplychain.StepType;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One thing a criterion looks at: a step (stepId, stepType) or a product/batch field. {@code missing} lists the
 * empty required fields of a step, so the panel can say what to fill.
 */
public record ScoreItem(
        ScoreItemCode code,
        @Nullable UUID stepId,
        @Nullable StepType stepType,
        boolean ok,
        @Nullable List<String> missing) {
}
