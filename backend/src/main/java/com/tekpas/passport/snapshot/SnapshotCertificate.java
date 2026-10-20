package com.tekpas.passport.snapshot;

import com.tekpas.document.DocType;
import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/** A certificate a person confirmed (CLAUDE.md rule 5), valid on the day of publishing. The file itself is not shared. */
public record SnapshotCertificate(String key, DocType type, @Nullable String certNo, @Nullable String holder,
        @Nullable String issuer, @Nullable LocalDate validFrom, LocalDate validUntil) {
}
