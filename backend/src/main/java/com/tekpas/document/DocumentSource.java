package com.tekpas.document;

/** Where a document came from. */
public enum DocumentSource {
    /** Uploaded by a user of the manufacturer, from the panel. */
    PANEL,
    /** Uploaded by a supplier through a data request link. */
    SUPPLIER_LINK
}
