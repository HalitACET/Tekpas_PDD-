package com.tekpas.passport;

import com.tekpas.passport.snapshot.PassportSnapshot;
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
 * One version of a batch's passport. Everything but the status and its transition columns is fixed at publishing
 * ({@code updatable = false}), and the V11 trigger refuses what the mapping would let through (CLAUDE.md rule 6).
 */
@Entity
@Table(name = "passport")
public class Passport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID batchId;

    @Column(nullable = false, updatable = false)
    private UUID companyId;

    @Column(nullable = false, updatable = false)
    private int version;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PassportStatus status;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, updatable = false, length = 14)
    private String gtin;

    @Column(nullable = false, updatable = false, length = 20)
    private String batchNo;

    @Column(nullable = false, updatable = false)
    private short schemaVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, updatable = false)
    private PassportSnapshot snapshot;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "snapshot_sha256", nullable = false, updatable = false, length = 64)
    private String snapshotSha256;

    @Column(nullable = false, updatable = false)
    private short completeness;

    @Column(updatable = false)
    private @Nullable UUID publishedBy;

    @Column(nullable = false, updatable = false)
    private Instant publishedAt;

    private @Nullable Instant supersededAt;

    private @Nullable Instant withdrawnAt;

    private @Nullable UUID withdrawnBy;

    @Column(length = 500)
    private @Nullable String withdrawReason;

    protected Passport() {
    }

    public Passport(UUID batchId, UUID companyId, int version, String gtin, String batchNo, PassportSnapshot snapshot,
            String snapshotSha256, int completeness, UUID publishedBy, Instant publishedAt) {
        this.batchId = batchId;
        this.companyId = companyId;
        this.version = version;
        this.status = PassportStatus.PUBLISHED;
        this.gtin = gtin;
        this.batchNo = batchNo;
        this.schemaVersion = (short) snapshot.schemaVersion();
        this.snapshot = snapshot;
        this.snapshotSha256 = snapshotSha256;
        this.completeness = (short) completeness;
        this.publishedBy = publishedBy;
        this.publishedAt = publishedAt;
    }

    /** The new version took over (V11 allows only PUBLISHED → SUPERSEDED). */
    public void supersede(Instant now) {
        this.status = PassportStatus.SUPERSEDED;
        this.supersededAt = now;
    }

    public void withdraw(UUID by, String reason, Instant now) {
        this.status = PassportStatus.WITHDRAWN;
        this.withdrawnAt = now;
        this.withdrawnBy = by;
        this.withdrawReason = reason;
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

    public int getVersion() {
        return version;
    }

    public PassportStatus getStatus() {
        return status;
    }

    public String getGtin() {
        return gtin;
    }

    public String getBatchNo() {
        return batchNo;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public PassportSnapshot getSnapshot() {
        return snapshot;
    }

    public String getSnapshotSha256() {
        return snapshotSha256;
    }

    public int getCompleteness() {
        return completeness;
    }

    public @Nullable UUID getPublishedBy() {
        return publishedBy;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public @Nullable Instant getSupersededAt() {
        return supersededAt;
    }

    public @Nullable Instant getWithdrawnAt() {
        return withdrawnAt;
    }

    public @Nullable UUID getWithdrawnBy() {
        return withdrawnBy;
    }

    public @Nullable String getWithdrawReason() {
        return withdrawReason;
    }
}
