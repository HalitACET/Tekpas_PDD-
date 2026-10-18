package com.tekpas.common.storage;

/** No storage provider is configured ({@code STORAGE_PROVIDER}); callers answer 503, not 500. */
public class StorageUnavailableException extends StorageException {

    public StorageUnavailableException() {
        super("File storage is not configured (tekpas.storage.provider)");
    }
}
