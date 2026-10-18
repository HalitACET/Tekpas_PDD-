package com.tekpas.document;

import java.text.Normalizer;
import java.util.Locale;

/**
 * The file name as it is shown (never used in a storage key or a path). Keeps letters and digits of any
 * language, drops directories, control and bidirectional-override characters (U+202E and friends) and
 * anything that could be read as markup or a path.
 */
final class FileNames {

    static final int MAX_LENGTH = 120;

    private FileNames() {
    }

    /** {@code extension} is the one of the detected type (".pdf", ".jpg", ".png"); added when the name lacks it. */
    static String display(String original, String extension) {
        String name = original == null ? "" : original;
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        name = Normalizer.normalize(name, Normalizer.Form.NFC);
        StringBuilder clean = new StringBuilder();
        name.codePoints().forEach(cp -> {
            if (Character.isLetterOrDigit(cp) || cp == '.' || cp == '-' || cp == '_' || cp == '(' || cp == ')'
                    || cp == '+') {
                clean.appendCodePoint(cp);
            } else if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) {
                clean.append(' ');
            } else if (!Character.isISOControl(cp) && Character.getType(cp) != Character.FORMAT) {
                clean.append('_');
            }
        });
        String result = clean.toString().replaceAll(" {2,}", " ").strip();
        result = result.replaceAll("^[.\\s]+", "").replaceAll("[.\\s]+$", "");
        if (result.isEmpty()) {
            result = "belge";
        }
        if (!hasExtensionOf(result, extension)) {
            result = result + extension;
        }
        if (result.length() > MAX_LENGTH) {
            int dot = result.lastIndexOf('.');
            String ext = dot > 0 && result.length() - dot <= 6 ? result.substring(dot) : "";
            result = result.substring(0, MAX_LENGTH - ext.length()) + ext;
        }
        return result;
    }

    private static boolean hasExtensionOf(String name, String extension) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (".jpg".equals(extension)) {
            return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
        }
        return lower.endsWith(extension);
    }
}
