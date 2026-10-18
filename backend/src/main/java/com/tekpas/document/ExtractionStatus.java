package com.tekpas.document;

/**
 * How far the reading got (V9 {@code chk_extraction_status}). Only the panel ever sees it; a supplier never
 * learns whether or how a document was read (docs/m5-plan.md §9).
 */
public enum ExtractionStatus {
    QUEUED, RUNNING, READ, PARTIAL, UNREADABLE, FAILED
}
