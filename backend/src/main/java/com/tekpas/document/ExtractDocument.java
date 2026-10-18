package com.tekpas.document;

import java.util.UUID;

/**
 * Payload of {@code AI_EXTRACT_DOCUMENT}, queued with every upload. Its handler (M5 T4) must cope with a document
 * that was removed meanwhile (nothing to do) and with one that is already read (run again = same result).
 */
public record ExtractDocument(UUID documentId) {
}
