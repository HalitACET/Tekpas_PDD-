package com.tekpas.passport.translation;

import com.tekpas.product.Product;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepType;
import com.tekpas.supplychain.SupplyStep;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A free text of a batch that its passport shows and a reader of another language would need translated
 * (docs/m11-plan.md §3): the product's description and care note, a step's fabric type and "other" dyeing process.
 * The product name, company, supplier and place names are never translated (docs/m6-plan.md). Codes are translated by
 * the page and are not here.
 *
 * @param field the text's identity: {@code product.description}, {@code product.care.note},
 *     {@code step.<step id>.fabricType}, {@code step.<step id>.dyeProcessOther}
 * @param language the language the text is written in: the care note's own, Turkish for the rest (the panel's
 *     forms have no language of their own)
 */
public record TranslatableText(String field, TextKind kind, @Nullable UUID stepId, @Nullable StepType stepType,
        String text, String language) {

    public enum TextKind { PRODUCT_DESCRIPTION, CARE_NOTE, FABRIC_TYPE, DYE_PROCESS_OTHER }

    /** The languages a passport is read in. */
    public static final List<String> LANGUAGES = List.of("tr", "en", "de");

    public static final String DESCRIPTION = "product.description";
    public static final String CARE_NOTE = "product.care.note";

    /** The other two languages, in {@link #LANGUAGES} order. */
    public List<String> targets() {
        return LANGUAGES.stream().filter(l -> !l.equals(language)).toList();
    }

    /** SHA-256 of the text: an approval is for this text only. */
    public String hash() {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The batch's texts in page order: the product's, then the steps' in chain order. Empty texts are left out. */
    public static List<TranslatableText> of(Product product, List<SupplyStep> chainInOrder) {
        List<TranslatableText> texts = new ArrayList<>();
        add(texts, DESCRIPTION, TextKind.PRODUCT_DESCRIPTION, null, null, product.getDescription(), "tr");
        if (product.getCareInfo() != null) {
            add(texts, CARE_NOTE, TextKind.CARE_NOTE, null, null, product.getCareInfo().note(),
                    product.getCareInfo().noteLanguage() == null ? "tr" : product.getCareInfo().noteLanguage());
        }
        for (SupplyStep step : chainInOrder) {
            StepData data = step.getData();
            String prefix = "step." + step.getId() + ".";
            add(texts, prefix + "fabricType", TextKind.FABRIC_TYPE, step.getId(), step.getStepType(),
                    data.fabricType(), "tr");
            add(texts, prefix + "dyeProcessOther", TextKind.DYE_PROCESS_OTHER, step.getId(), step.getStepType(),
                    data.dyeProcessOther(), "tr");
        }
        return texts;
    }

    private static void add(List<TranslatableText> texts, String field, TextKind kind, @Nullable UUID stepId,
            @Nullable StepType stepType, @Nullable String text, String language) {
        if (text != null && !text.isBlank()) {
            texts.add(new TranslatableText(field, kind, stepId, stepType, text.strip(), language));
        }
    }
}
