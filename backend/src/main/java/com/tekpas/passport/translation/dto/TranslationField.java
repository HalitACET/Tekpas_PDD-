package com.tekpas.passport.translation.dto;

import com.tekpas.passport.translation.TranslatableText.TextKind;
import com.tekpas.supplychain.StepType;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One free text and its translations.
 *
 * @param field the text's identity, sent back when saving
 * @param stepType for a step's text, which step it belongs to
 * @param source the text as written; {@code sourceLanguage} its language
 * @param translations one entry per other language, whether it has a text or not
 */
public record TranslationField(String field, TextKind kind, @Nullable StepType stepType, String source,
        String sourceLanguage, List<TranslationEntry> translations) {

    public TranslationField {
        translations = List.copyOf(translations);
    }
}
