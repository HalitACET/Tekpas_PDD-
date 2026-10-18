package com.tekpas.document;

/** How a document was read (V9 {@code chk_document_method}). */
public enum ExtractionMethod {
    /** The PDF's text layer and the per-type label rules. */
    TEXT_RULES,
    /** The LLM, only where the LLM gate allows it (M5 T5). */
    LLM,
    /** Nothing could be read (no text layer, nothing recognised). */
    NONE
}
