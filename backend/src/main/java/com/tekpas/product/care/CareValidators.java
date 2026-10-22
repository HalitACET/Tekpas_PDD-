package com.tekpas.product.care;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.Map;
import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;

final class CareValidators {

    private CareValidators() {
    }

    static final class SymbolIn implements ConstraintValidator<CareSymbolIn, CareInstruction> {

        private CareCategory category = CareCategory.WASHING;

        @Override
        public void initialize(CareSymbolIn annotation) {
            category = annotation.value();
        }

        @Override
        public boolean isValid(CareInstruction value, ConstraintValidatorContext context) {
            if (value == null || value.symbol() == null || value.symbol().category() == category) {
                return true;
            }
            context.unwrap(HibernateConstraintValidatorContext.class)
                    .withDynamicPayload(Map.of("category", category.name()));
            return false;
        }
    }

    static final class GentlenessAllowed implements ConstraintValidator<CareGentleness, CareInstruction> {

        @Override
        public boolean isValid(CareInstruction value, ConstraintValidatorContext context) {
            return value == null || value.symbol() == null || value.symbol().allows(value.gentleness());
        }
    }
}
