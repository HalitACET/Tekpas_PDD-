package com.tekpas.passport.snapshot;

import org.jspecify.annotations.Nullable;

/** The company behind a step (supplier names are public, docs/m6-plan.md §9 decision 4). No phone, no contact. */
public record SnapshotActor(String name, @Nullable String city, String country) {
}
