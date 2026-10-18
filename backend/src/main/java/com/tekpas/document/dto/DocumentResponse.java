package com.tekpas.document.dto;

import com.tekpas.document.DocType;
import com.tekpas.document.Document;
import com.tekpas.document.DocumentSource;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.document.ReviewStatus;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A document as the manufacturer's panel sees it (design v0.5 56–58). What was read from it (fields, confidence)
 * is added by the reading pipeline (M5 T4–T6); this carries the upload and the state of the reading.
 *
 * @param extractionStatus how far the reading got; QUEUED until the worker picks it up
 * @param failureCode technical reason when the reading failed or found no text (shown small, "Teknik ayrıntı")
 * @param uploadedByName the panel user, or the supplier company for a link upload
 */
public record DocumentResponse(UUID id, @Nullable UUID stepId, DocType docType, String originalName, String mimeType,
        long sizeBytes, @Nullable Integer pageCount, ExtractionStatus extractionStatus, ReviewStatus reviewStatus,
        @Nullable String failureCode, DocumentSource source, @Nullable String uploadedByName, Instant createdAt) {

    public static DocumentResponse from(Document d) {
        return new DocumentResponse(d.getId(), d.getStepId(), d.getDocType(), d.getOriginalName(), d.getMimeType(),
                d.getSizeBytes(), d.getPageCount(), d.getExtractionStatus(), d.getReviewStatus(), d.getFailureCode(),
                d.source(), d.getUploadedByName(), d.getCreatedAt());
    }
}
