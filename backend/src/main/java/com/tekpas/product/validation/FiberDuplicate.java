package com.tekpas.product.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** No fiber appears twice in a composition. Field error code "FiberDuplicate", {@code params.fiber}. */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = FiberValidators.Duplicate.class)
public @interface FiberDuplicate {

    String message() default "{fiber} appears more than once";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
