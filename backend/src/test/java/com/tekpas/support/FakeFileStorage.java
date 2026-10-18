package com.tekpas.support;

import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.storage.StorageException;
import com.tekpas.common.storage.StorageUnavailableException;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.jspecify.annotations.Nullable;

/** In-memory storage for the integration tests; can be told to fail and to hand out local file URIs. */
public class FakeFileStorage implements FileStorage {

    public record Stored(byte[] bytes, String contentType) {
    }

    private final Map<String, Stored> objects = new ConcurrentHashMap<>();
    private volatile boolean unavailable;
    private volatile boolean failing;
    private volatile boolean fileUris;

    @Override
    public void put(String key, byte[] content, String contentType) {
        check();
        if (objects.putIfAbsent(key, new Stored(content.clone(), contentType)) != null) {
            throw new StorageException("Storage object already exists");
        }
    }

    @Override
    public URI signedDownloadUrl(String key, Duration ttl, @Nullable String downloadName) {
        check();
        Stored stored = objects.get(key);
        if (stored == null) {
            throw new StorageException("Storage signing failed (HTTP 404)");
        }
        if (fileUris) {
            try {
                Path file = Files.createTempFile("fake-storage-", ".bin");
                Files.write(file, stored.bytes());
                file.toFile().deleteOnExit();
                return file.toUri();
            } catch (IOException e) {
                throw new StorageException("fake", e);
            }
        }
        return URI.create("https://storage.test/object/sign/" + key + "?token=t&ttl=" + ttl.toSeconds()
                + (downloadName == null ? "" : "&download=" + downloadName.replace(' ', '+')));
    }

    @Override
    public void delete(String key) {
        if (unavailable) {
            throw new StorageUnavailableException();
        }
        objects.remove(key);
    }

    private void check() {
        if (unavailable) {
            throw new StorageUnavailableException();
        }
        if (failing) {
            throw new StorageException("Storage upload failed (HTTP 500)");
        }
    }

    public Map<String, Stored> objects() {
        return Map.copyOf(objects);
    }

    public @Nullable Stored get(String key) {
        return objects.get(key);
    }

    public void unavailable(boolean value) {
        this.unavailable = value;
    }

    public void failing(boolean value) {
        this.failing = value;
    }

    public void fileUris(boolean value) {
        this.fileUris = value;
    }

    public void reset() {
        objects.clear();
        unavailable = false;
        failing = false;
        fileUris = false;
    }
}
