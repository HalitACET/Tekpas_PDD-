package com.tekpas.request;

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
 * A link that lets a supplier fill one step without an account (K14, K21). Only the SHA-256 of the token is
 * stored; the token itself is shown once, when the link is created.
 */
@Entity
@Table(name = "data_request")
public class DataRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID stepId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, updatable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RequestStatus status;

    @Column(nullable = false, updatable = false)
    private Instant expiresAt;

    private @Nullable Instant openedAt;

    @Column(nullable = false)
    private int openCount;

    private @Nullable Instant completedAt;

    private @Nullable Instant revokedAt;

    private @Nullable UUID revokedBy;

    private @Nullable String submitterName;

    private @Nullable String submitterRole;

    @Column(updatable = false)
    private @Nullable UUID createdBy;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected DataRequest() {
    }

    public DataRequest(UUID stepId, String tokenHash, Instant expiresAt, UUID createdBy, Instant now) {
        this.stepId = stepId;
        this.tokenHash = tokenHash;
        this.status = RequestStatus.SENT;
        this.expiresAt = expiresAt;
        this.createdBy = createdBy;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getStepId() {
        return stepId;
    }

    public RequestStatus getStatus() {
        return status;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public @Nullable Instant getOpenedAt() {
        return openedAt;
    }

    public int getOpenCount() {
        return openCount;
    }

    public @Nullable Instant getCompletedAt() {
        return completedAt;
    }

    public @Nullable String getSubmitterName() {
        return submitterName;
    }

    public @Nullable String getSubmitterRole() {
        return submitterRole;
    }

    public @Nullable UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** An open link past its deadline becomes EXPIRED; true when that happened now. */
    public boolean expireIfDue(Instant now) {
        if (status.isOpen() && !now.isBefore(expiresAt)) {
            status = RequestStatus.EXPIRED;
            return true;
        }
        return false;
    }

    /** The supplier opened the link; true on the first opening. */
    public boolean open(Instant now) {
        openCount++;
        status = RequestStatus.OPENED;
        if (openedAt == null) {
            openedAt = now;
            return true;
        }
        return false;
    }

    public void complete(String name, @Nullable String role, Instant now) {
        status = RequestStatus.COMPLETED;
        completedAt = now;
        submitterName = name;
        submitterRole = role;
    }

    public void revoke(UUID userId, Instant now) {
        status = RequestStatus.REVOKED;
        revokedAt = now;
        revokedBy = userId;
    }
}
