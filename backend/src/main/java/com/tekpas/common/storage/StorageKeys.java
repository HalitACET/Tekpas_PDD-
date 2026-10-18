package com.tekpas.common.storage;

import java.util.regex.Pattern;

/** The shape every storage accepts: also what keeps a key from leaving its directory or bucket path. */
final class StorageKeys {

    /** {@code document.file_key} is VARCHAR(300). */
    static final int MAX_LENGTH = 300;

    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*");

    private StorageKeys() {
    }

    /** Letters, digits, {@code . _ -} in segments split by single slashes; no empty or dot-leading segment. */
    static String require(String key) {
        if (key == null || key.length() > MAX_LENGTH || !SAFE.matcher(key).matches()) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return key;
    }
}
