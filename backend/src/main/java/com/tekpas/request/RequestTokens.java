package com.tekpas.request;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

/** Link tokens: 32 random bytes in base64url (43 characters); stored only as SHA-256 hex (backend/CLAUDE.md). */
public final class RequestTokens {

    private static final SecureRandom RANDOM = new SecureRandom();

    private RequestTokens() {
    }

    public static String generate() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }

    /** Only a well-formed token is looked up; anything else is an unknown link. */
    public static boolean wellFormed(String token) {
        return token.length() == 43 && token.chars().allMatch(c -> Character.isLetterOrDigit(c) && c < 128
                || c == '-' || c == '_');
    }

    /** "Gönderim no" (design v0.4 43, 44): a short code derived from the request id, for reference only. */
    public static String code(UUID requestId) {
        return "KP-R-" + requestId.toString().substring(0, 4).toUpperCase();
    }
}
