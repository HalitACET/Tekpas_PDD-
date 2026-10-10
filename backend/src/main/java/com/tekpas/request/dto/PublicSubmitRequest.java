package com.tekpas.request.dto;

import com.tekpas.supplychain.StepData;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * The supplier's form (design v0.4 40, 41): the step's data and who sends it ("Gönderen").
 *
 * @param submitterRole "Göreviniz", optional
 */
public record PublicSubmitRequest(
        @NotNull @Valid StepData data,
        @NotBlank @Size(max = 100) String submitterName,
        @Nullable @Size(max = 100) String submitterRole) {
}
