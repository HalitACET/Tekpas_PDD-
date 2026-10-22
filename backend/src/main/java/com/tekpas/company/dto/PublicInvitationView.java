package com.tekpas.company.dto;

import com.tekpas.company.UserRole;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/** What the invited person sees before choosing a password (design brief v1.2 161). */
public record PublicInvitationView(String companyName, String fullName, String email, UserRole role,
        @Nullable String invitedByName, Instant expiresAt) {
}
