package com.tekpas.passport;

import com.tekpas.product.Gtin;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;

/**
 * GS1 Digital Link of a batch's passport (PLAN K13): {@code {base}/01/{gtin14}/10/{batchNo}}. The GTIN is always the
 * 14-digit form, the batch number is AI (10): up to 20 characters of A–Z, 0–9 and "-" (the rule of the batch
 * number, M2), so nothing needs percent-encoding. Mirrored in {@code packages/shared} and checked against the same
 * cases (test-vectors/gs1-digital-link.json).
 */
public final class Gs1DigitalLink {

    private static final Pattern BATCH_NO = Pattern.compile("[A-Z0-9-]{1,20}");

    /** What a code resolves to: the canonical GTIN-14 and batch number. */
    public record Key(String gtin, String batchNo) {

        public String path() {
            return Gs1DigitalLink.path(gtin, batchNo);
        }
    }

    private Gs1DigitalLink() {
    }

    /** {@code /01/{gtin14}/10/{batchNo}}; both must be valid (they are, for a published passport). */
    public static String path(String gtin, String batchNo) {
        if (!Gtin.hasAcceptedFormat(gtin) || !Gtin.hasValidCheckDigit(gtin)) {
            throw new IllegalArgumentException("Not a valid GTIN");
        }
        if (!BATCH_NO.matcher(batchNo).matches()) {
            throw new IllegalArgumentException("Not a GS1 AI (10) batch number");
        }
        return "/01/" + Gtin.normalize(gtin) + "/10/" + batchNo;
    }

    /** The full address; a trailing slash of the base is dropped. */
    public static String url(String baseUrl, String gtin, String batchNo) {
        return baseUrl.replaceAll("/+$", "") + path(gtin, batchNo);
    }

    /**
     * The key a scanned address stands for, or empty when it is not one: GTIN-8, -12, -13 or -14 with a valid check
     * digit (normalized to 14 digits), batch number upper-cased. Used by the public lookup, which answers an
     * unreadable code like an unknown one.
     */
    public static Optional<Key> parse(@Nullable String gtin, @Nullable String batchNo) {
        if (gtin == null || batchNo == null || !Gtin.hasAcceptedFormat(gtin) || !Gtin.hasValidCheckDigit(gtin)) {
            return Optional.empty();
        }
        String batch = batchNo.toUpperCase(Locale.ROOT);
        return BATCH_NO.matcher(batch).matches() ? Optional.of(new Key(Gtin.normalize(gtin), batch)) : Optional.empty();
    }
}
