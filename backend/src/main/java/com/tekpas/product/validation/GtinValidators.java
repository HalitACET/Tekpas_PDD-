package com.tekpas.product.validation;

import com.tekpas.product.Gtin;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

final class GtinValidators {

    private GtinValidators() {
    }

    static final class Format implements ConstraintValidator<GtinFormat, String> {

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || Gtin.hasAcceptedFormat(value);
        }
    }

    static final class CheckDigit implements ConstraintValidator<GtinCheckDigit, String> {

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || !Gtin.hasAcceptedFormat(value) || Gtin.hasValidCheckDigit(value);
        }
    }
}
