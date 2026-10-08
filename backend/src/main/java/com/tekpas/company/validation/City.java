package com.tekpas.company.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * One of Turkey's 81 provinces (com.tekpas.company.TurkishProvinces), surrounding spaces ignored. Null and
 * blank are valid (combine with @NotBlank). The field error code is "City".
 */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CityValidator.class)
public @interface City {

    String message() default "Must be one of Turkey's 81 provinces";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
