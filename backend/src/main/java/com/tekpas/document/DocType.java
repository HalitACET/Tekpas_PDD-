package com.tekpas.document;

/** What a document is (V9 {@code chk_doc_type}). A supplier does not have to know: UNKNOWN until the reader says. */
public enum DocType {
    OEKO_TEX, GOTS, GRS, BCI, OCS, BLUESIGN, LAB_REPORT, SDS, INVOICE, TECH_SHEET, OTHER, UNKNOWN
}
