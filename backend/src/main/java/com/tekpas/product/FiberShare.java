package com.tekpas.product;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** One line of a fiber composition: whole percent, 1–100. */
public record FiberShare(@NotNull Fiber fiber, @NotNull @Min(1) @Max(100) Integer percent) {
}
