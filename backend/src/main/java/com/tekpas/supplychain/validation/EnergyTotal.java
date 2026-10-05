package com.tekpas.supplychain.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The percentages of an energy mix add up to exactly 100. Field error code "EnergyTotal" with
 * {@code params.total}, like FiberTotal.
 */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = EnergyValidators.Total.class)
public @interface EnergyTotal {

    String message() default "Energy shares must add up to 100 (now {total})";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
