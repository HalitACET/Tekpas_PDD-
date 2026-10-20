package com.tekpas.passport.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Withdrawing needs a reason (kept for the audit trail, never shown to the consumer). */
public record WithdrawRequest(@NotBlank @Size(max = 500) String reason) {
}
