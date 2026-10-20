package com.tekpas.validation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * A finding of a consistency check, kept for good (docs/m7-plan.md §3): a resolved issue keeps its row, so that the
 * same finding is not written twice and the audit trail (M12) can read what was decided and by whom.
 */
@Entity
@Table(name = "validation_issue")
public class ValidationIssue {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID batchId;

    @Column(nullable = false, updatable = false)
    private UUID companyId;

    @Column(updatable = false)
    private @Nullable UUID stepId;

    @Column(updatable = false)
    private @Nullable UUID documentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private IssueSource source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private IssueSeverity severity;

    /** "LIF-01": see {@link IssueCode#code()}. */
    @Column(nullable = false, length = 50, updatable = false)
    private String code;

    @Column(nullable = false)
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private IssueParams params;

    @Column(nullable = false, updatable = false, length = 200)
    private String fingerprint;

    @Column(nullable = false)
    private boolean resolved;

    private @Nullable UUID resolvedBy;

    private @Nullable Instant resolvedAt;

    @Column(length = 500)
    private @Nullable String resolutionNote;

    @Column(nullable = false)
    private boolean autoResolved;

    private @Nullable Instant lastSeenAt;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected ValidationIssue() {
    }

    public static ValidationIssue open(UUID batchId, UUID companyId, IssueSource source, Finding finding, Instant now) {
        ValidationIssue issue = new ValidationIssue();
        issue.batchId = batchId;
        issue.companyId = companyId;
        issue.stepId = finding.stepId();
        issue.documentId = finding.documentId();
        issue.source = source;
        issue.severity = finding.severity();
        issue.code = finding.code().code();
        issue.message = finding.message();
        issue.params = finding.params();
        issue.fingerprint = finding.fingerprint();
        issue.createdAt = now;
        issue.lastSeenAt = now;
        return issue;
    }

    /** The check found it again. */
    void seen(Finding finding, Instant now) {
        this.message = finding.message();
        this.params = finding.params();
        this.lastSeenAt = now;
    }

    /** The data was corrected: the issue closes itself, nobody decided anything. */
    void autoResolve(Instant now) {
        this.resolved = true;
        this.autoResolved = true;
        this.resolvedBy = null;
        this.resolvedAt = now;
        this.resolutionNote = null;
    }

    /** The data went wrong again in the same way as before it was corrected. */
    void reappear(Finding finding, Instant now) {
        this.resolved = false;
        this.autoResolved = false;
        this.resolvedBy = null;
        this.resolvedAt = null;
        this.resolutionNote = null;
        seen(finding, now);
    }

    /** A person decided this one needs no action (WARNING and INFO only; the service enforces that). */
    void resolve(UUID userId, @Nullable String note, Instant now) {
        this.resolved = true;
        this.autoResolved = false;
        this.resolvedBy = userId;
        this.resolvedAt = now;
        this.resolutionNote = note;
    }

    /** Take back a person's decision. */
    void reopen() {
        this.resolved = false;
        this.autoResolved = false;
        this.resolvedBy = null;
        this.resolvedAt = null;
        this.resolutionNote = null;
    }

    public UUID getId() {
        return id;
    }

    public UUID getBatchId() {
        return batchId;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public @Nullable UUID getStepId() {
        return stepId;
    }

    public @Nullable UUID getDocumentId() {
        return documentId;
    }

    public IssueSource getSource() {
        return source;
    }

    public IssueSeverity getSeverity() {
        return severity;
    }

    public IssueCode getCode() {
        return IssueCode.ofCode(code);
    }

    public String getMessage() {
        return message;
    }

    public IssueParams getParams() {
        return params;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public boolean isResolved() {
        return resolved;
    }

    public @Nullable UUID getResolvedBy() {
        return resolvedBy;
    }

    public @Nullable Instant getResolvedAt() {
        return resolvedAt;
    }

    public @Nullable String getResolutionNote() {
        return resolutionNote;
    }

    public boolean isAutoResolved() {
        return autoResolved;
    }

    public @Nullable Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
