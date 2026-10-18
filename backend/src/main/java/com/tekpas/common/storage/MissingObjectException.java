package com.tekpas.common.storage;

/** The storage has no object under the key: another attempt will not find it either. */
public class MissingObjectException extends StorageException {

    public MissingObjectException() {
        super("Storage object not found");
    }
}
