package com.tekpas.supplychain;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** One line of an energy mix: whole percent, 1–100. */
public record EnergyShare(@NotNull EnergySource source, @NotNull @Min(1) @Max(100) Integer percent) {
}
