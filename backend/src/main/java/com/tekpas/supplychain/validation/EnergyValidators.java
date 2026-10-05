package com.tekpas.supplychain.validation;

import com.tekpas.supplychain.EnergyShare;
import com.tekpas.supplychain.EnergySource;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;

final class EnergyValidators {

    private EnergyValidators() {
    }

    static final class Total implements ConstraintValidator<EnergyTotal, List<EnergyShare>> {

        @Override
        public boolean isValid(List<EnergyShare> value, ConstraintValidatorContext context) {
            if (value == null || value.stream().anyMatch(share -> share == null || share.percent() == null)) {
                return true;
            }
            int total = value.stream().mapToInt(EnergyShare::percent).sum();
            if (total == 100) {
                return true;
            }
            context.unwrap(HibernateConstraintValidatorContext.class)
                    .addMessageParameter("total", total)
                    .withDynamicPayload(Map.of("total", total));
            return false;
        }
    }

    static final class Duplicate implements ConstraintValidator<EnergyDuplicate, List<EnergyShare>> {

        @Override
        public boolean isValid(List<EnergyShare> value, ConstraintValidatorContext context) {
            if (value == null) {
                return true;
            }
            Set<EnergySource> seen = EnumSet.noneOf(EnergySource.class);
            EnergySource duplicate = value.stream()
                    .filter(Objects::nonNull)
                    .map(EnergyShare::source)
                    .filter(Objects::nonNull)
                    .filter(source -> !seen.add(source))
                    .findFirst()
                    .orElse(null);
            if (duplicate == null) {
                return true;
            }
            context.unwrap(HibernateConstraintValidatorContext.class)
                    .addMessageParameter("source", duplicate.name())
                    .withDynamicPayload(Map.of("source", duplicate.name()));
            return false;
        }
    }
}
