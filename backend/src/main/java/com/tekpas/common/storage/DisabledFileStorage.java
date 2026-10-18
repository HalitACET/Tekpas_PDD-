package com.tekpas.common.storage;

import java.net.URI;
import java.time.Duration;
import org.jspecify.annotations.Nullable;

/** The default when no provider is configured: the application starts, uploads answer 503. */
final class DisabledFileStorage implements FileStorage {

    @Override
    public void put(String key, byte[] content, String contentType) {
        throw new StorageUnavailableException();
    }

    @Override
    public URI signedDownloadUrl(String key, Duration ttl, @Nullable String downloadName) {
        throw new StorageUnavailableException();
    }

    @Override
    public void delete(String key) {
        throw new StorageUnavailableException();
    }
}
