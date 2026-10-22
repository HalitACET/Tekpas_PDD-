package com.tekpas.passport.translation.dto;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The batch's free texts and their translations before publishing (docs/m11-plan.md §3, design v1.1 140).
 *
 * @param aiAvailable whether "suggest" can ask the AI: only for demo companies with the LLM switched on (rule 4)
 * @param suggesting a suggestion is queued or running; poll until false
 * @param suggestionFailure how the latest suggestion ended when it did not work: AI_LIMIT_REACHED (today's AI calls
 *     are used up) or SUGGESTION_FAILED (the AI did not answer usably); nothing was changed either way
 */
public record TranslationsResponse(boolean aiAvailable, boolean suggesting, @Nullable String suggestionFailure,
        List<TranslationField> fields) {

    public TranslationsResponse {
        fields = List.copyOf(fields);
    }
}
