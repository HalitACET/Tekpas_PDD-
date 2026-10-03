package com.tekpas.common.persistence;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/** Tells which database constraint a failed write violated, to turn it into a precise API error. */
public final class Constraints {

    private Constraints() {
    }

    public static boolean violates(DataIntegrityViolationException ex, String constraintName) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                return constraintName.equalsIgnoreCase(violation.getConstraintName());
            }
        }
        return false;
    }
}
