package com.tekpas.product.validation;

import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;

final class FiberValidators {

    private FiberValidators() {
    }

    static final class Total implements ConstraintValidator<FiberTotal, List<FiberShare>> {

        @Override
        public boolean isValid(List<FiberShare> value, ConstraintValidatorContext context) {
            if (value == null || value.stream().anyMatch(share -> share == null || share.percent() == null)) {
                return true;
            }
            int total = value.stream().mapToInt(FiberShare::percent).sum();
            if (total == 100) {
                return true;
            }
            context.unwrap(HibernateConstraintValidatorContext.class)
                    .addMessageParameter("total", total)
                    .withDynamicPayload(Map.of("total", total));
            return false;
        }
    }

    static final class Duplicate implements ConstraintValidator<FiberDuplicate, List<FiberShare>> {

        @Override
        public boolean isValid(List<FiberShare> value, ConstraintValidatorContext context) {
            if (value == null) {
                return true;
            }
            Set<Fiber> seen = EnumSet.noneOf(Fiber.class);
            Fiber duplicate = value.stream()
                    .filter(Objects::nonNull)
                    .map(FiberShare::fiber)
                    .filter(Objects::nonNull)
                    .filter(fiber -> !seen.add(fiber))
                    .findFirst()
                    .orElse(null);
            if (duplicate == null) {
                return true;
            }
            context.unwrap(HibernateConstraintValidatorContext.class)
                    .addMessageParameter("fiber", duplicate.name())
                    .withDynamicPayload(Map.of("fiber", duplicate.name()));
            return false;
        }
    }
}
