package com.tekpas.validation;

import com.fasterxml.jackson.annotation.JsonValue;
import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The fixed code of each check (docs/m7-plan.md §2). The code and its severity never change; the words are the
 * translation files' (issues.*), the database only keeps the code and the structured {@link IssueParams}.
 */
@Schema(enumAsRef = true)
public enum IssueCode {
    /** The label's fibre composition and a yarn or fabric step's declaration differ by more than the tolerance. */
    LIF_01("LIF-01", IssueSeverity.ERROR),
    /** A fibre composition does not add up to 100. */
    LIF_02("LIF-02", IssueSeverity.ERROR),
    /** A confirmed certificate has expired and nothing of its type replaced it. */
    SER_01("SER-01", IssueSeverity.ERROR),
    /** A confirmed certificate ends within 30 days. */
    SER_02("SER-02", IssueSeverity.WARNING),
    /** The certificate's holder is not the step's supplier. */
    SER_03("SER-03", IssueSeverity.WARNING),
    /** An approved step that should hold a certificate has none. */
    SER_04("SER-04", IssueSeverity.WARNING),
    /** The product has no label fibre composition. */
    EKS_01("EKS-01", IssueSeverity.WARNING),
    /** A production date of the batch is empty. */
    EKS_02("EKS-02", IssueSeverity.INFO),
    /** A document waits for a person's confirmation and is not in the passport. */
    BEL_01("BEL-01", IssueSeverity.INFO),
    /**
     * AI suggestion: a certificate's scope may not cover what the step made or the product is (docs/m7-plan.md §8).
     * Never blocking: the AI proposes, a person decides (CLAUDE.md rule 5).
     */
    AI_01("AI-01", IssueSeverity.WARNING),
    /** AI suggestion: two declarations of the batch (label, steps, certificates) may contradict each other. */
    AI_02("AI-02", IssueSeverity.WARNING);

    private final String code;
    private final IssueSeverity severity;

    IssueCode(String code, IssueSeverity severity) {
        this.code = code;
        this.severity = severity;
    }

    /** "LIF-01": what is stored in {@code validation_issue.code} and shown on the card. */
    @JsonValue
    public String code() {
        return code;
    }

    public IssueSeverity severity() {
        return severity;
    }

    public static IssueCode ofCode(String code) {
        for (IssueCode c : values()) {
            if (c.code.equals(code)) {
                return c;
            }
        }
        throw new IllegalArgumentException("Unknown issue code " + code);
    }
}
