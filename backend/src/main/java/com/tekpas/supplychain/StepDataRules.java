package com.tekpas.supplychain;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import java.util.ArrayList;
import java.util.List;

/**
 * Checks step data beyond bean validation, for the manufacturer's edit (PATCH /steps/{id}) and the supplier's
 * submission. Field names come back as {@code data.<field>}, like bean validation's.
 */
public final class StepDataRules {

    private StepDataRules() {
    }

    /** Fields of another step type (NotApplicable) and the rules between fields. */
    public static void check(StepType type, StepData data) {
        throw400(violations(type, data, false));
    }

    /** As {@link #check}, plus the fields a submission needs (NotNull). */
    public static void checkSubmission(StepType type, StepData data) {
        throw400(violations(type, data, true));
    }

    private static List<FieldViolation> violations(StepType type, StepData data, boolean submission) {
        List<FieldViolation> errors = new ArrayList<>();
        data.fieldsNotFor(type).forEach(field -> errors.add(new FieldViolation("data." + field, "NotApplicable",
                "Not a field of a " + type + " step")));
        data.ruleViolations().forEach(rule -> errors.add(new FieldViolation("data." + rule.getKey(), rule.getValue(),
                rule.getKey() + " is invalid (" + rule.getValue() + ")")));
        if (submission) {
            data.missingFor(type).forEach(field -> errors.add(new FieldViolation("data." + field, "NotNull",
                    "Required to submit a " + type + " step")));
        }
        return errors;
    }

    private static void throw400(List<FieldViolation> errors) {
        if (!errors.isEmpty()) {
            throw new InvalidFieldsException(errors.toArray(FieldViolation[]::new));
        }
    }
}
