package com.tekpas.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.security.access.prepost.PreAuthorize;

/** Product and batch data may be changed by OWNER, ADMIN and EDITOR (PLAN.md §2). */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasAnyRole('OWNER', 'ADMIN', 'EDITOR')")
public @interface WriteAccess {
}
