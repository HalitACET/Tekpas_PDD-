package com.tekpas.importer;

import com.tekpas.document.reading.Folding;
import com.tekpas.product.Fiber;
import com.tekpas.product.ProductCategory;
import java.text.MessageFormat;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ResourceBundle;
import org.jspecify.annotations.Nullable;

/**
 * The template's texts (i18n/import*.properties: headers, sheet names, category and fibre names in tr, en, de) and
 * the reverse lookup the reader needs: a cell may hold a name in any of the three languages or the API code.
 */
final class ImportTexts {

    static final List<String> LANGUAGES = List.of("tr", "en", "de");

    private static final ResourceBundle.Control CONTROL =
            ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_PROPERTIES);
    private static final Map<String, ProductCategory> CATEGORIES = lookup(ProductCategory.values(), "category.");
    private static final Map<String, Fiber> FIBERS = lookup(Fiber.values(), "fiber.");

    private final ResourceBundle bundle;
    private final Locale locale;

    private ImportTexts(String language) {
        this.locale = Locale.forLanguageTag(language);
        this.bundle = ResourceBundle.getBundle("i18n/import", locale, CONTROL);
    }

    /** tr when the language is not one of ours. */
    static ImportTexts of(@Nullable String language) {
        return new ImportTexts(language != null && LANGUAGES.contains(language) ? language : "tr");
    }

    String text(String key, Object... arguments) {
        String pattern = bundle.getString(key);
        return arguments.length == 0 ? pattern : new MessageFormat(pattern, locale).format(arguments);
    }

    String category(ProductCategory category) {
        return bundle.getString("category." + category.name());
    }

    String fiber(Fiber fiber) {
        return bundle.getString("fiber." + fiber.name());
    }

    static @Nullable ProductCategory categoryOf(String cell) {
        return CATEGORIES.get(key(cell));
    }

    static @Nullable Fiber fiberOf(String cell) {
        return FIBERS.get(key(cell));
    }

    private static <E extends Enum<E>> Map<String, E> lookup(E[] values, String prefix) {
        Map<String, E> map = new HashMap<>();
        for (E value : values) {
            map.put(key(value.name()), value);
            for (String language : LANGUAGES) {
                map.putIfAbsent(key(new ImportTexts(language).bundle.getString(prefix + value.name())), value);
            }
        }
        return Map.copyOf(map);
    }

    /** Case, Turkish dots, accents and spacing do not matter; "T_SHIRT" and "t-shirt" are the same. */
    private static String key(String text) {
        return Folding.fold(text).replaceAll("[\\s_\\-]+", "");
    }
}
