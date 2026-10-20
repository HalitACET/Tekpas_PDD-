package com.tekpas.passport.snapshot;

import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/** What a consumer may know of the batch: when it was produced. No quantity, no production order number. */
public record SnapshotBatch(@Nullable LocalDate producedFrom, @Nullable LocalDate producedTo) {
}
