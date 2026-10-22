package com.tekpas.product.care;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** The instruction's symbol belongs to this category (field error code "CareSymbolIn", {@code params.category}). */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = CareValidators.SymbolIn.class)
public @interface CareSymbolIn {

    CareCategory value();

    String message() default "Choose a symbol of the {value} group";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
