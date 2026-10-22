package com.tekpas.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * OWNER and ADMIN (PLAN.md §2): approving and rejecting, publishing and withdrawing, and managing the supplier network.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN')")
public @interface ReviewAccess {
}
