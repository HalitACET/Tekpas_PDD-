package com.tekpas.importer.dto;

import org.jspecify.annotations.Nullable;

/**
 * A row that could not be imported, and why.
 *
 * @param row the spreadsheet's row number (the header is row 1)
 * @param column gtin, sku, name, category, description, fiber1…3, percent1…3, or fibers for the whole composition
 * @param code the API's field error code (GtinCheckDigit, FiberTotal, NotBlank…), UnknownValue for a name not in the
 *     template's lists, Duplicate for a GTIN twice in the file, Unique for one the company already has
 * @param value the cell as read, cut at 100 characters
 */
public record ImportRowError(int row, String column, String code, @Nullable String value) {
}
