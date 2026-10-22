package com.tekpas.passport.snapshot;

/**
 * An approved translation of one of the passport's free texts (schemaVersion 3, docs/m11-plan.md §3).
 *
 * @param field where the text is: {@code product.description}, {@code product.care.note}, {@code s3.fabricType}
 * @param language tr, en or de
 * @param aiAssisted suggested by the AI and approved unchanged by the manufacturer (the page says so)
 */
public record SnapshotTranslation(String field, String language, String text, boolean aiAssisted) {
}
