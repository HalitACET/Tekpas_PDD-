package com.tekpas.request;

/** What happened to a step (V6 {@code chk_step_event_kind}). */
public enum StepEventKind {
    REQUEST_CREATED,
    REQUEST_OPENED,
    REQUEST_REVOKED,
    /** The link's deadline was changed (3, 7 or 14 days from its creation). */
    REQUEST_DEADLINE_CHANGED,
    SUBMITTED,
    APPROVED,
    REJECTED,
    /** The manufacturer entered the data itself (FIBER origin): a manufacturer's declaration. */
    MANUFACTURER_ENTERED,
    /** A certificate or technical sheet was uploaded (panel or link); detail: documentId, docType, source. */
    DOCUMENT_UPLOADED,
    DOCUMENT_REMOVED,
    /** A person confirmed what was read from a document (M5 T6). */
    DOCUMENT_VERIFIED
}
