package com.tekpas.product.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The percentages of a fiber composition add up to exactly 100. The field error (code "FiberTotal") carries
 * {@code params.total}, the actual sum, so the form can show it. Lines with a missing percent are left to
 * their own @NotNull error.
 */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FiberValidators.Total.class)
public @interface FiberTotal {

    String message() default "Fiber percentages must add up to 100 (now {total})";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
