package com.tekpas.document;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * What the reading proposes ({@code document.extraction}, docs/m5-plan.md §2). Written once by the reading job and
 * never changed; a person confirms or corrects it (M5 T6) and only then do values reach the real fields
 * (CLAUDE.md rule 5). Never shown to the supplier.
 *
 * @param detectedType what the text looks like; the document's own {@code docType} is not changed by it
 * @param warnings codes for the panel: EXPIRED, VALIDITY_RANGE_INVALID, TYPE_NOT_RECOGNISED
 */
public record Extraction(DocType detectedType, ExtractionMethod method, Fields fields, List<String> warnings) {

    /** The certificate fields; a missing one was not found. Dates are ISO ({@code 2027-03-31}). */
    public record Fields(@Nullable Field certNo, @Nullable Field holderName, @Nullable Field issuer,
            @Nullable Field validFrom, @Nullable Field validUntil) {

        public static Fields none() {
            return new Fields(null, null, null, null, null);
        }
    }

    /**
     * One proposed value. {@code confidence} below 0.8 is shown yellow; a value from the LLM never exceeds 0.79.
     *
     * @param evidence where in the document it was found (page from 1, the line, at most 120 characters)
     */
    public record Field(String value, double confidence, FieldSource source, @Nullable Evidence evidence) {
    }

    public record Evidence(int page, String snippet) {
    }

    /** Where a value came from: the PDF's text by per-type rules, or the LLM (T5). */
    public enum FieldSource { TEXT_RULES, LLM }
}
