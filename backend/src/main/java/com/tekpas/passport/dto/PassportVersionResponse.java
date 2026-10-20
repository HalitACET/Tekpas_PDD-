package com.tekpas.passport.dto;

import com.tekpas.passport.PassportStatus;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** One version of a batch's passport, without its content (the versions tab, the answer of publishing). */
public record PassportVersionResponse(
        UUID id,
        UUID batchId,
        int version,
        PassportStatus status,
        String gtin,
        String batchNo,
        int schemaVersion,
        int completeness,
        String verificationCode,
        Instant publishedAt,
        @Nullable String publishedByName,
        @Nullable Instant supersededAt,
        @Nullable Instant withdrawnAt,
        @Nullable String withdrawnByName,
        @Nullable String withdrawReason) {
}
