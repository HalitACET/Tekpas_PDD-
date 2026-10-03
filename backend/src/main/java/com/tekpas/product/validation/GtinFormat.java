package com.tekpas.product.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 8, 12, 13 or 14 digits. Null is valid (combine with @NotNull). The field error code is "GtinFormat". */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = GtinValidators.Format.class)
public @interface GtinFormat {

    String message() default "GTIN must have 8, 12, 13 or 14 digits";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
