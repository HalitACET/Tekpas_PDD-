package com.tekpas.document.dto;

import com.tekpas.document.DocType;
import com.tekpas.document.Document;
import com.tekpas.document.DocumentSource;
import com.tekpas.document.Extraction;
import com.tekpas.document.ExtractionMethod;
import com.tekpas.document.ExtractionStatus;
import com.tekpas.document.ReviewStatus;
import com.tekpas.document.Verification;
import java.time.Instant;
import java.time.LocalDate;
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
 * @param certNo the confirmed values (null until a person confirmed the document, or when left empty)
 * @param verifiedByName the panel user who confirmed it
 * @param verification per field: accepted as proposed, edited, or added by hand (docType included)
 * @param rereadable whether "Tekrar oku" works now: a failed reading always, an unreadable one only while the LLM
 *     gate is open for the company (the LLM may read what the rules could not); never a confirmed document
 */
public record DocumentResponse(UUID id, @Nullable UUID stepId, DocType docType, String originalName, String mimeType,
        long sizeBytes, @Nullable Integer pageCount, ExtractionStatus extractionStatus, ReviewStatus reviewStatus,
        @Nullable String failureCode, DocumentSource source, @Nullable String uploadedByName, Instant createdAt,
        @Nullable Extraction extraction, @Nullable ExtractionMethod extractionMethod, @Nullable Instant extractedAt,
        @Nullable String certNo, @Nullable String holderName, @Nullable String issuer, @Nullable LocalDate validFrom,
        @Nullable LocalDate validUntil, @Nullable String verifiedByName, @Nullable Instant verifiedAt,
        @Nullable Verification verification, boolean rereadable) {

    public static DocumentResponse from(Document d, @Nullable String verifiedByName, boolean llmOpen) {
        return new DocumentResponse(d.getId(), d.getStepId(), d.getDocType(), d.getOriginalName(), d.getMimeType(),
                d.getSizeBytes(), d.getPageCount(), d.getExtractionStatus(), d.getReviewStatus(), d.getFailureCode(),
                d.source(), d.getUploadedByName(), d.getCreatedAt(), d.getExtraction(), d.getExtractionMethod(),
                d.getExtractedAt(), d.getCertNo(), d.getHolderName(), d.getIssuer(), d.getValidFrom(),
                d.getValidUntil(), verifiedByName, d.getVerifiedAt(), d.getVerification(), d.rereadable(llmOpen));
    }
}
