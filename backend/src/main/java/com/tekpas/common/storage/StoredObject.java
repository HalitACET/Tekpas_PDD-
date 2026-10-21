package com.tekpas.common.storage;

import java.time.Instant;

/** An object in the storage, as a listing shows it. */
public record StoredObject(String key, Instant createdAt) {
}
