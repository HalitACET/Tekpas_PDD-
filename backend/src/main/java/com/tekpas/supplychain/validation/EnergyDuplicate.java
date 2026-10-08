package com.tekpas.supplychain.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** No energy source appears twice in a mix. Field error code "EnergyDuplicate", {@code params.source}. */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = EnergyValidators.Duplicate.class)
public @interface EnergyDuplicate {

    String message() default "{source} appears more than once";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
