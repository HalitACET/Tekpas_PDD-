package com.tekpas.importer.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One import (design v1.1 150): where it stands and, once DONE, what came of it.
 *
 * @param fileSize the uploaded file's bytes; null for an import made before it was kept
 * @param status QUEUED, RUNNING, DONE or FAILED; poll until DONE or FAILED
 * @param totalRows non-empty rows read; {@code createdRows} became products, {@code failedRows} did not
 * @param errors per row and column, at most 200 (the counts are complete); empty in a list of imports
 * @param failureCode why the whole file was refused: TEMPLATE_UNKNOWN, TOO_MANY_ROWS, UNREADABLE
 */
public record ImportResponse(UUID id, String kind, String fileName, @Nullable Integer fileSize, String status, int totalRows, int createdRows,
        int failedRows, List<ImportRowError> errors, @Nullable String failureCode, @Nullable String createdByName,
        Instant createdAt, @Nullable Instant finishedAt) {

    public ImportResponse {
        errors = List.copyOf(errors);
    }
}
