package com.tekpas.document;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * An uploaded certificate or technical sheet. {@code companyId} is always the manufacturer that owns the
 * batch (never the supplier). The file itself lives in the {@code FileStorage} under {@code fileKey}. What was
 * read from it is written by the reading pipeline (M5 T3–T6) and only after a person confirms it moves to
 * the real fields.
 */
@Entity
@Table(name = "document")
public class Document {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID companyId;

    private @Nullable UUID stepId;

    @Column(updatable = false)
    private @Nullable UUID requestId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DocType docType;

    @Column(nullable = false, updatable = false, length = 300)
    private String fileKey;

    @Column(nullable = false, length = 255)
    private String originalName;

    @Column(nullable = false, updatable = false, length = 100)
    private String mimeType;

    @Column(nullable = false, updatable = false)
    private long sizeBytes;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "sha256", nullable = false, updatable = false, length = 64)
    private String sha256;

    @Column(updatable = false)
    private @Nullable Integer pageCount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExtractionStatus extractionStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReviewStatus reviewStatus;

    private @Nullable String failureCode;

    @Column(updatable = false)
    private @Nullable UUID uploadedBy;

    @Column(updatable = false)
    private @Nullable String uploadedByName;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected Document() {
    }

    public Document(UUID id, UUID companyId, UUID stepId, @Nullable UUID requestId, DocType docType, String fileKey,
            String originalName, String mimeType, long sizeBytes, String sha256, @Nullable Integer pageCount,
            @Nullable UUID uploadedBy, @Nullable String uploadedByName, Instant now) {
        this.id = id;
        this.companyId = companyId;
        this.stepId = stepId;
        this.requestId = requestId;
        this.docType = docType;
        this.fileKey = fileKey;
        this.originalName = originalName;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256;
        this.pageCount = pageCount;
        this.extractionStatus = ExtractionStatus.QUEUED;
        this.reviewStatus = ReviewStatus.UNREVIEWED;
        this.uploadedBy = uploadedBy;
        this.uploadedByName = uploadedByName;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public @Nullable UUID getStepId() {
        return stepId;
    }

    public @Nullable UUID getRequestId() {
        return requestId;
    }

    public DocType getDocType() {
        return docType;
    }

    public String getFileKey() {
        return fileKey;
    }

    public String getOriginalName() {
        return originalName;
    }

    public String getMimeType() {
        return mimeType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public @Nullable Integer getPageCount() {
        return pageCount;
    }

    public ExtractionStatus getExtractionStatus() {
        return extractionStatus;
    }

    public ReviewStatus getReviewStatus() {
        return reviewStatus;
    }

    public @Nullable String getFailureCode() {
        return failureCode;
    }

    public @Nullable UUID getUploadedBy() {
        return uploadedBy;
    }

    public @Nullable String getUploadedByName() {
        return uploadedByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public DocumentSource source() {
        return requestId == null ? DocumentSource.PANEL : DocumentSource.SUPPLIER_LINK;
    }
}
