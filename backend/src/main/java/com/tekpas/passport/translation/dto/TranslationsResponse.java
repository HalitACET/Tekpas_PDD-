package com.tekpas.passport.translation.dto;

import java.util.List;

/**
 * The batch's free texts and their translations before publishing (docs/m11-plan.md §3, design v1.1 140).
 *
 * @param aiAvailable whether "suggest" can ask the AI: only for demo companies with the LLM switched on (rule 4)
 * @param suggesting a suggestion is queued or running; poll until false
 */
public record TranslationsResponse(boolean aiAvailable, boolean suggesting, List<TranslationField> fields) {

    public TranslationsResponse {
        fields = List.copyOf(fields);
    }
}
