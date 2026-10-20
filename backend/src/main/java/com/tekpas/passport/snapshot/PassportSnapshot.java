package com.tekpas.passport.snapshot;

import java.util.List;

/**
 * What a published passport freezes (docs/m6-plan.md §3.2), as typed records so that the JSONB column and the API
 * say the same. Language-independent: codes and numbers, the page translates. The compliance score is not part of it
 * (decision 3, the consumer does not see it); it lives in {@code passport.completeness}.
 */
public record PassportSnapshot(
        int schemaVersion,
        SnapshotPassport passport,
        SnapshotManufacturer manufacturer,
        SnapshotProduct product,
        SnapshotBatch batch,
        List<SnapshotStep> supplyChain,
        List<SnapshotCertificate> certificates) {

    public static final int SCHEMA_VERSION = 1;

    public PassportSnapshot {
        supplyChain = List.copyOf(supplyChain);
        certificates = List.copyOf(certificates);
    }
}
