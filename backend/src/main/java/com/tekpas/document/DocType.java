package com.tekpas.document;

/** What a document is (V9 {@code chk_doc_type}). A supplier does not have to know: UNKNOWN until the reader says. */
public enum DocType {
    OEKO_TEX, GOTS, GRS, BCI, OCS, BLUESIGN, LAB_REPORT, SDS, INVOICE, TECH_SHEET, OTHER, UNKNOWN;

    /**
     * Whether the document is a certificate: one that has a number and a validity. Confirming it needs both
     * ({@code DocumentService.verify}); a technical sheet, a lab report, a safety data sheet, an invoice or anything
     * else does not.
     */
    public boolean isCertificate() {
        return switch (this) {
            case OEKO_TEX, GOTS, GRS, BCI, OCS, BLUESIGN -> true;
            case LAB_REPORT, SDS, INVOICE, TECH_SHEET, OTHER, UNKNOWN -> false;
        };
    }
}
