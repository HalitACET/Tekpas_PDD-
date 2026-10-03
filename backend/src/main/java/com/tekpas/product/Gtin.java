package com.tekpas.product;

import java.util.regex.Pattern;

/**
 * GS1 GTIN rules. GTIN-8, -12 (UPC), -13 (EAN) and -14 are accepted and stored as 14 digits, left-padded
 * with zeros; the check digit (mod 10) is the same before and after padding. Mirrored in
 * {@code packages/shared} and checked against the same test vectors.
 */
public final class Gtin {

    private static final Pattern ACCEPTED = Pattern.compile("\\d{8}|\\d{12,14}");

    private Gtin() {
    }

    /** 8, 12, 13 or 14 digits, nothing else (no spaces or dashes). */
    public static boolean hasAcceptedFormat(String value) {
        return ACCEPTED.matcher(value).matches();
    }

    /** The 14-digit form. The value must have an accepted format. */
    public static String normalize(String value) {
        requireAcceptedFormat(value);
        return "0".repeat(14 - value.length()) + value;
    }

    /** True if the last digit is the GS1 check digit of the others. The value must have an accepted format. */
    public static boolean hasValidCheckDigit(String value) {
        requireAcceptedFormat(value);
        int last = value.length() - 1;
        return checkDigit(value.substring(0, last)) == value.charAt(last) - '0';
    }

    /** GS1 mod 10: from the right, digits are weighted 3, 1, 3, 1, ... */
    public static int checkDigit(String digitsWithoutCheck) {
        int sum = 0;
        for (int i = 0; i < digitsWithoutCheck.length(); i++) {
            int digit = digitsWithoutCheck.charAt(digitsWithoutCheck.length() - 1 - i) - '0';
            sum += digit * (i % 2 == 0 ? 3 : 1);
        }
        return (10 - sum % 10) % 10;
    }

    private static void requireAcceptedFormat(String value) {
        if (!hasAcceptedFormat(value)) {
            throw new IllegalArgumentException("Not a GTIN-8/12/13/14");
        }
    }
}
