package com.tekpas.passport.snapshot;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Published passports never change: a version 1 snapshot (before care instructions) still reads. */
class PassportSnapshotSchemaTest {

    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void aVersionOneSnapshotReadsWithoutCareInstructions() {
        String v1 = """
                {"schemaVersion":1,
                 "passport":{"version":1,"publishedAt":"2026-10-01T09:00:00Z","gtin":"02012345000018","batchNo":"KP-1"},
                 "manufacturer":{"name":"Nilüfer Giyim A.Ş.","city":"Bursa","country":"TR"},
                 "product":{"name":"Mavi Basic Tişört","category":"T_SHIRT","description":null,
                            "fiberComposition":[{"fiber":"COTTON","percent":100}]},
                 "batch":{"producedFrom":"2026-09-01","producedTo":"2026-09-20"},
                 "supplyChain":[],"certificates":[]}
                """;

        PassportSnapshot snapshot = json.readValue(v1, PassportSnapshot.class);

        assertThat(snapshot.schemaVersion()).isEqualTo(1);
        assertThat(snapshot.product().name()).isEqualTo("Mavi Basic Tişört");
        assertThat(snapshot.product().care()).isNull();
    }
}
