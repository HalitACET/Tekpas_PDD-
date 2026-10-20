package com.tekpas.passport.snapshot;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/** The passport's own identity. {@code publishedAt} is empty in a preview (nothing is published yet). */
public record SnapshotPassport(int version, @Nullable Instant publishedAt, String gtin, String batchNo) {
}
