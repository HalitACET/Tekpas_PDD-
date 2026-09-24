package com.tekpas.company;

/** Mirrors {@code chk_user_role} in V1. Permissions per role: docs/PLAN.md §2. */
public enum UserRole {
    OWNER,
    ADMIN,
    EDITOR,
    SUPPLIER,
    VIEWER
}
