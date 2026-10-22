package com.tekpas.passport.translation.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** Translations edited and approved in one go; texts left out stay as they are. */
public record TranslationsUpdateRequest(@NotNull @Size(max = 60) List<@NotNull @Valid Entry> entries) {

    /**
     * @param field a field of {@code GET /batches/{id}/translations} (field error TranslationField otherwise)
     * @param language not the source's own language (field error TranslationLanguage)
     * @param text null or blank removes the translation; changing an AI text makes it the user's
     * @param approved approve it for the source text as it is now
     */
    public record Entry(@NotBlank @Size(max = 120) String field, @NotBlank @Pattern(regexp = "^(tr|en|de)$") String language,
            @Nullable @Size(max = 2000) String text, boolean approved) {
    }
}
