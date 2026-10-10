package com.tekpas.supplychain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * "Düzeltme iste" (design v0.4 47b). The reason goes to the supplier (45).
 *
 * @param fields step data fields to mark on the supplier's form, from the preset reasons; only names of the
 *     step type's fields are accepted
 */
public record StepRejectRequest(@NotBlank @Size(max = 500) String reason, @Nullable List<String> fields) {
}
