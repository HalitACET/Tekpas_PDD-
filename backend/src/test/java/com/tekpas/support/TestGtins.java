package com.tekpas.support;

import com.tekpas.product.Gtin;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Fresh valid GTINs for tests. GTINs are unique across all companies and the test database is shared by
 * all tests, so each test needs its own.
 */
public final class TestGtins {

    private TestGtins() {
    }

    /** A valid GTIN-13 in the restricted circulation range (2xxxxxxxxxxxC). */
    public static String gtin13() {
        StringBuilder body = new StringBuilder("2");
        for (int i = 0; i < 11; i++) {
            body.append(ThreadLocalRandom.current().nextInt(10));
        }
        return body.toString() + Gtin.checkDigit(body.toString());
    }

    /** The same GTIN with a wrong check digit. */
    public static String withWrongCheckDigit(String gtin) {
        int last = gtin.length() - 1;
        return gtin.substring(0, last) + (char) ('0' + (gtin.charAt(last) - '0' + 1) % 10);
    }
}
