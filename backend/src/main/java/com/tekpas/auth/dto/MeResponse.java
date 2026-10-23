package com.tekpas.auth.dto;

import com.tekpas.company.AppUser;
import com.tekpas.company.Company;
import com.tekpas.company.UserRole;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * {@code GET /auth/me}. Same fields as {@link UserSummary} today; kept separate so /me can grow
 * (e.g. permissions) without changing the login response.
 */
public record MeResponse(
        UUID id,
        String email,
        String fullName,
        UserRole role,
        String locale,
        CompanySummary company,
        @Nullable String ownerName) {

    /** @param ownerName the company's owner, for "ask … for access" (design v1.2 169); null without an active owner */
    public static MeResponse from(AppUser user, Company company, @Nullable String ownerName) {
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(),
                user.getLocale(), CompanySummary.from(company), ownerName);
    }
}
