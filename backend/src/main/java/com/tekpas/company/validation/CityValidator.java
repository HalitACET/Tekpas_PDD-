package com.tekpas.company.validation;

import com.tekpas.company.TurkishProvinces;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

final class CityValidator implements ConstraintValidator<City, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || value.isBlank() || TurkishProvinces.contains(value.trim());
    }
}
