package com.tekpas.common.storage;

import java.net.URI;
import java.time.Duration;
import org.jspecify.annotations.Nullable;

/**
 * Where uploaded documents live. The rest of the application only sees this interface: production talks to
 * Supabase Storage, local development and tests use the filesystem, and until a provider is configured every
 * call fails with {@link StorageUnavailableException}.
 *
 * <p>Keys are chosen by the application (never derived from a file name), see {@link StorageKeys}.
 */
public interface FileStorage {

    /** Largest object the application stores (PLAN K10); the callers enforce it, the storage trusts it. */
    long MAX_OBJECT_BYTES = 10L * 1024 * 1024;

    /** Stores a new object. An existing key is never overwritten. */
    void put(String key, byte[] content, String contentType);

    /**
     * A link that lets the holder download the object for {@code ttl} and nothing else. {@code downloadName}
     * becomes the file name of the download (an attachment), null shows the object inline.
     */
    URI signedDownloadUrl(String key, Duration ttl, @Nullable String downloadName);

    /** The object's bytes, for the server's own use (reading a document). A missing object is an error. */
    byte[] read(String key);

    /** Removes the object; a missing object is not an error. */
    void delete(String key);
}
