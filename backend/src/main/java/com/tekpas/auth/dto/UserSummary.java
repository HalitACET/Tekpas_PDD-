package com.tekpas.auth.dto;

import com.tekpas.company.AppUser;
import com.tekpas.company.Company;
import com.tekpas.company.UserRole;
import java.util.UUID;

/** Returned by login and by {@code GET /auth/me}. */
public record UserSummary(
        UUID id,
        String email,
        String fullName,
        UserRole role,
        String locale,
        CompanySummary company) {

    public static UserSummary from(AppUser user, Company company) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), user.getRole(),
                user.getLocale(), CompanySummary.from(company));
    }
}
