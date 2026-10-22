package com.tekpas.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/** Managing the company's users and their roles is for the OWNER only (PLAN.md §2, M12). */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('OWNER')")
public @interface OwnerAccess {
}
