package com.tekpas.product.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * GS1 check digit. Only checked when the format is valid, so a malformed value reports GtinFormat alone.
 * The field error code is "GtinCheckDigit".
 */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = GtinValidators.CheckDigit.class)
public @interface GtinCheckDigit {

    String message() default "GTIN check digit is wrong";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
