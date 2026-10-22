package com.tekpas.product.care;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** The symbol can carry the chosen bars (field error code "CareGentleness"). */
@Target({ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CareValidators.GentlenessAllowed.class)
public @interface CareGentleness {

    String message() default "This symbol takes no gentle or very gentle bars";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
