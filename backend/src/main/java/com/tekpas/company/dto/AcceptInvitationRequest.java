package com.tekpas.company.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** At most 72 characters: BCrypt reads no more. */
public record AcceptInvitationRequest(@NotBlank @Size(min = 10, max = 72) String password) {
}
