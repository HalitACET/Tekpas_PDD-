package com.tekpas.common.storage;

/** The storage could not do what was asked. The message never carries credentials or response bodies. */
public class StorageException extends RuntimeException {

    public StorageException(String message) {
        super(message);
    }

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
