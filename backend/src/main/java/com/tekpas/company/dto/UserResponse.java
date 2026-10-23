package com.tekpas.company.dto;

import com.tekpas.company.UserRole;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One of the company's users (suppliers' users are not listed here).
 *
 * @param invitationExpiresAt while INVITED or INVITATION_EXPIRED: when the link runs or ran out
 * @param inactiveSince while INACTIVE: when the user was deactivated (unknown for users deactivated before V24)
 * @param you the user asking: they cannot change their own role or deactivate themselves
 */
public record UserResponse(UUID id, String email, String fullName, UserRole role, UserStatus status,
        @Nullable Instant lastLoginAt, @Nullable Instant invitationExpiresAt, @Nullable Instant inactiveSince,
        boolean you) {
}
