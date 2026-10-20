package com.tekpas.document.reading;

/**
 * Turkish-safe text matching. The labels and phrases the reader looks for are written once, in lower case without
 * diacritics ({@code sertifika sahibi}); the text is folded the same way before it is matched, so
 * {@code SERTİFİKA SAHİBİ}, {@code Sertifika Sahibi}, {@code SERTIFIKA SAHIBI} and a copy that lost its dots
 * ({@code sertifika sahıbı}) are all the same label. This replaces {@code CASE_INSENSITIVE} and
 * {@code toLowerCase()}, whose result depends on the JVM's default locale (in {@code tr}, "I" becomes "ı" and
 * "TITLE" no longer matches "title") and, with {@code Locale.ROOT}, turns "İ" into "i" plus a combining dot.
 *
 * <p>The folding is one character to one character, so an offset found in the folded text is the same offset in
 * the original line and the value can be cut from the original (it keeps its case and its dots: İSTANBUL).
 */
public final class Folding {

    private Folding() {
    }

    /** Same length as {@code text}. No {@code Locale} is involved: {@code Character.toLowerCase} is locale-free. */
    public static String fold(String text) {
        char[] out = new char[text.length()];
        for (int i = 0; i < out.length; i++) {
            out[i] = fold(text.charAt(i));
        }
        return new String(out);
    }

    static char fold(char c) {
        return switch (c) {
            case 'İ', 'I', 'ı', 'Î', 'î' -> 'i';
            case 'Ş', 'ş' -> 's';
            case 'Ç', 'ç' -> 'c';
            case 'Ğ', 'ğ' -> 'g';
            case 'Ö', 'ö' -> 'o';
            case 'Ü', 'ü', 'Û', 'û' -> 'u';
            case 'Â', 'â' -> 'a';
            default -> Character.toLowerCase(c);
        };
    }
}
