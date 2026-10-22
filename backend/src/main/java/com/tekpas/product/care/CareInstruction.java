package com.tekpas.product.care;

import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.Nullable;

/**
 * One symbol of a care label.
 *
 * @param gentleness bars under the symbol; only temperature washes and P, F, W carry them (field error
 *     CareGentleness otherwise). Missing means {@link Gentleness#NORMAL}.
 */
@CareGentleness
public record CareInstruction(@NotNull CareSymbol symbol, @Nullable Gentleness gentleness) {

    public CareInstruction {
        gentleness = gentleness == null ? Gentleness.NORMAL : gentleness;
    }
}
