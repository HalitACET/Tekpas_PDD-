package com.tekpas.passport.translation.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * A text in one language.
 *
 * @param text null when there is none: the passport then shows the source, labelled with its language
 * @param aiSuggested the text came from the AI and nobody has changed it
 * @param approved approved for the source as it is now; only these go into the passport
 * @param stale it was approved or suggested for an earlier source text, which has changed since
 */
public record TranslationEntry(String language, @Nullable String text, boolean aiSuggested, boolean approved,
        boolean stale, @Nullable Instant approvedAt, @Nullable String approvedByName) {
}
