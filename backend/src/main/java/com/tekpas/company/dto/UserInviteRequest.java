package com.tekpas.company.dto;

import com.tekpas.company.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** @param role OWNER, ADMIN, EDITOR or VIEWER (a supplier's user is not invited here: field error InviteRole) */
public record UserInviteRequest(@NotBlank @Email @Size(max = 200) String email,
        @NotBlank @Size(max = 150) String fullName, @NotNull UserRole role) {
}
