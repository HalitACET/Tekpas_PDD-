package com.tekpas.product.care;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * A product's care instructions (design v1.0 120a, ISO 3758): at most one symbol per category, each optional, and a
 * free note in the language it was written in. Stored on the product ({@code product.care_info}) and frozen into
 * the passport snapshot (schemaVersion 2). A symbol of another category is the field error CareSymbolIn.
 *
 * @param note e.g. "Ters çevirerek yıkayın", shown as written, never translated
 * @param noteLanguage the note's language (tr, en or de), so a page in another language can say so; tr if missing
 */
public record CareInfo(
        @Nullable @Valid @CareSymbolIn(CareCategory.WASHING) CareInstruction washing,
        @Nullable @Valid @CareSymbolIn(CareCategory.BLEACHING) CareInstruction bleaching,
        @Nullable @Valid @CareSymbolIn(CareCategory.DRYING) CareInstruction drying,
        @Nullable @Valid @CareSymbolIn(CareCategory.IRONING) CareInstruction ironing,
        @Nullable @Valid @CareSymbolIn(CareCategory.PROFESSIONAL) CareInstruction professional,
        @Nullable @Size(max = 200) String note,
        @Nullable @Pattern(regexp = "^(tr|en|de)$") String noteLanguage) {

    public CareInfo {
        note = note == null || note.isBlank() ? null : note.strip();
        noteLanguage = note == null ? null : noteLanguage == null ? "tr" : noteLanguage;
    }

    /** Nothing chosen and no note: the passport shows no care section, so the product stores none. */
    @JsonIgnore
    public boolean isEmpty() {
        return washing == null && bleaching == null && drying == null && ironing == null && professional == null
                && note == null;
    }
}
