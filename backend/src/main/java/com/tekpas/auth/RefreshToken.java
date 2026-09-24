package com.tekpas.auth;

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

/** Only the SHA-256 hash of the token is stored; the raw value is returned to the client once. */
@Entity
@Table(name = "refresh_token")
public class RefreshToken {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private UUID familyId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ClientType client;

    @Column(nullable = false)
    private Instant expiresAt;

    private Instant usedAt;

    private Instant revokedAt;

    @Column(length = 300)
    private String userAgent;

    @Column(insertable = false, updatable = false)
    private Instant createdAt;

    protected RefreshToken() {
    }

    RefreshToken(UUID userId, UUID familyId, String tokenHash, ClientType client, Instant expiresAt,
            String userAgent) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.familyId = familyId;
        this.tokenHash = tokenHash;
        this.client = client;
        this.expiresAt = expiresAt;
        this.userAgent = userAgent;
    }

    void markUsed(Instant at) {
        this.usedAt = at;
    }

    boolean isExpired(Instant now) {
        return !now.isBefore(expiresAt);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getFamilyId() {
        return familyId;
    }

    public ClientType getClient() {
        return client;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUsedAt() {
        return usedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }
}
