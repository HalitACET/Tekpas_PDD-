package com.tekpas.document.dto;

import com.tekpas.document.DocType;
import com.tekpas.document.Document;
import com.tekpas.document.DocumentSource;
import com.tekpas.document.Extraction;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.document.ReviewStatus;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A document as the manufacturer's panel sees it (design v0.5 56–58): the upload, the state of the reading and,
 * once it ran, what it proposes (fields with confidence and evidence).
 *
 * @param extractionStatus how far the reading got; QUEUED until the worker picks it up
 * @param failureCode technical reason when the reading failed or found no text (shown small, "Teknik ayrıntı")
 * @param uploadedByName the panel user, or the supplier company for a link upload
 * @param extraction what the reading proposes, once it ran; a person confirms it before anything is applied
 */
public record DocumentResponse(UUID id, @Nullable UUID stepId, DocType docType, String originalName, String mimeType,
        long sizeBytes, @Nullable Integer pageCount, ExtractionStatus extractionStatus, ReviewStatus reviewStatus,
        @Nullable String failureCode, DocumentSource source, @Nullable String uploadedByName, Instant createdAt,
        @Nullable Extraction extraction, @Nullable ExtractionMethod extractionMethod, @Nullable Instant extractedAt) {

    public static DocumentResponse from(Document d) {
        return new DocumentResponse(d.getId(), d.getStepId(), d.getDocType(), d.getOriginalName(), d.getMimeType(),
                d.getSizeBytes(), d.getPageCount(), d.getExtractionStatus(), d.getReviewStatus(), d.getFailureCode(),
                d.source(), d.getUploadedByName(), d.getCreatedAt(), d.getExtraction(), d.getExtractionMethod(),
                d.getExtractedAt());
    }
}
