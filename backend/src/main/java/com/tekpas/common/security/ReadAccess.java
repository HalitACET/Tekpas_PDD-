package com.tekpas.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * Company staff may read (OWNER, ADMIN, EDITOR, VIEWER). SUPPLIER users get 403 before any record is looked
 * up. Simple rule until the full role matrix (PLAN.md §2, M12).
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')")
public @interface ReadAccess {
}
