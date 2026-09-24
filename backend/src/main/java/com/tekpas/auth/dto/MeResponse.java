package com.tekpas.auth.dto;

import com.tekpas.company.AppUser;
import com.tekpas.company.Company;
import com.tekpas.company.UserRole;
import java.util.UUID;

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
        CompanySummary company) {

    public static MeResponse from(AppUser user, Company company) {
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(),
                user.getLocale(), CompanySummary.from(company));
    }
}
