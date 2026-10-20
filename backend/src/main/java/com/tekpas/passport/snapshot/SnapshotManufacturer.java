package com.tekpas.passport.snapshot;

import org.jspecify.annotations.Nullable;

/** The company that publishes the passport. */
public record SnapshotManufacturer(String name, @Nullable String city, String country) {
}
