package com.tekpas.passport;

import java.util.HexFormat;

/**
 * The short "doğrulama kodu" of a version (design v0.6 Pasaport): eight characters out of the first five bytes of the
 * snapshot's SHA-256, written XXXX-XXXX with an alphabet without the look-alikes 0/O and 1/I. It changes when the
 * content does; the full hash is stored.
 */
public final class VerificationCode {

    private static final String ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    private VerificationCode() {
    }

    public static String of(String sha256Hex) {
        byte[] bytes = HexFormat.of().parseHex(sha256Hex.substring(0, 10));
        long bits = 0;
        for (byte b : bytes) {
            bits = (bits << 8) | (b & 0xFF);
        }
        StringBuilder code = new StringBuilder(9);
        for (int i = 7; i >= 0; i--) {
            code.append(ALPHABET.charAt((int) ((bits >> (5 * i)) & 31)));
            if (i == 4) {
                code.append('-');
            }
        }
        return code.toString();
    }
}
