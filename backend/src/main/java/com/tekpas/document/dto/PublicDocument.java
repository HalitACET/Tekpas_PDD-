package com.tekpas.document.dto;

import com.tekpas.document.Document;
import java.time.Instant;
import java.util.UUID;

/**
 * A document as the link holder sees it (design v0.5 51–55). Deliberately nothing about reading: no status,
 * type, value, confidence or failure code (docs/m5-plan.md §9, an allow-list test guards it).
 *
 * @param previous uploaded through an earlier link of the step (55 "Önceki gönderim"): read-only
 */
public record PublicDocument(UUID id, String fileName, long sizeBytes, Instant uploadedAt, boolean previous) {

    public static PublicDocument from(Document d, UUID currentRequestId) {
        return new PublicDocument(d.getId(), d.getOriginalName(), d.getSizeBytes(), d.getCreatedAt(),
                !currentRequestId.equals(d.getRequestId()));
    }
}
