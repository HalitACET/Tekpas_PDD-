package com.tekpas.company.dto;

import com.tekpas.company.UserRole;
import org.jspecify.annotations.Nullable;

/**
 * Fields left out stay as they are.
 *
 * @param role   OWNER, ADMIN, EDITOR or VIEWER
 * @param active false deactivates (signed out everywhere); true opens a deactivated account again
 */
public record UserUpdateRequest(@Nullable UserRole role, @Nullable Boolean active) {
}
