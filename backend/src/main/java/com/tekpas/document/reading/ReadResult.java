package com.tekpas.document.reading;

import com.tekpas.document.Extraction;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import org.jspecify.annotations.Nullable;

/**
 * The outcome of one reading.
 *
 * @param failureCode why nothing (or not enough) was read, shown small as "Teknik ayrıntı": NO_TEXT_LAYER (an
 *        image or a scan), NO_KNOWN_FIELDS (text, but nothing the rules know), LLM_UNAVAILABLE (the LLM was asked but
 *        did not answer: limit, quota, network), LLM_NO_RESULT (it answered, but nothing usable)
 */
public record ReadResult(ExtractionStatus status, ExtractionMethod method, @Nullable String failureCode,
        @Nullable Extraction extraction) {

    public static final String NO_TEXT_LAYER = "NO_TEXT_LAYER";
    public static final String NO_KNOWN_FIELDS = "NO_KNOWN_FIELDS";
    public static final String LLM_UNAVAILABLE = "LLM_UNAVAILABLE";
    public static final String LLM_NO_RESULT = "LLM_NO_RESULT";

    /** The same reading, given up for {@code code}: the person types the values. */
    public ReadResult unreadable(String code) {
        return new ReadResult(ExtractionStatus.UNREADABLE, ExtractionMethod.NONE, code, extraction);
    }
}
