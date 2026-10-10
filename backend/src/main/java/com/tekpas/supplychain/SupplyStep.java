package com.tekpas.supplychain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;

/**
 * One step of a batch's supply chain. The links between steps (which step uses which step's output) live in
 * {@code supply_step_input}; together they form a DAG (V4).
 */
@Entity
@Table(name = "supply_step")
public class SupplyStep {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private StepType stepType;

    private @Nullable UUID supplierCompanyId;

    @Column(nullable = false)
    private short sortOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StepStatus status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private StepData data;

    private @Nullable Instant submittedAt;

    private @Nullable UUID approvedBy;

    private @Nullable Instant approvedAt;

    private @Nullable String rejectionReason;

    @JdbcTypeCode(SqlTypes.JSON)
    private @Nullable List<String> rejectionFields;

    private @Nullable Instant rejectedAt;

    private @Nullable UUID rejectedBy;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected SupplyStep() {
    }

    public SupplyStep(UUID batchId, StepType stepType, int sortOrder, Instant now) {
        this.batchId = batchId;
        this.stepType = stepType;
        this.sortOrder = (short) sortOrder;
        this.status = StepStatus.PENDING;
        this.data = StepData.EMPTY;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getBatchId() {
        return batchId;
    }

    public StepType getStepType() {
        return stepType;
    }

    public @Nullable UUID getSupplierCompanyId() {
        return supplierCompanyId;
    }

    public void assignSupplier(@Nullable UUID supplierCompanyId) {
        this.supplierCompanyId = supplierCompanyId;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public StepStatus getStatus() {
        return status;
    }

    public StepData getData() {
        return data;
    }

    public void replaceData(StepData data) {
        this.data = data;
    }

    public @Nullable Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }

    public @Nullable Instant getApprovedAt() {
        return approvedAt;
    }

    public @Nullable String getRejectionReason() {
        return rejectionReason;
    }

    public List<String> getRejectionFields() {
        return rejectionFields == null ? List.of() : rejectionFields;
    }

    public @Nullable Instant getRejectedAt() {
        return rejectedAt;
    }

    public @Nullable UUID getRejectedBy() {
        return rejectedBy;
    }

    /** The supplier's data arrived through a data request (PENDING or REJECTED → SUBMITTED). */
    public void submit(StepData data, Instant now) {
        this.data = data;
        this.status = StepStatus.SUBMITTED;
        this.submittedAt = now;
        this.rejectionReason = null;
        this.rejectionFields = null;
        this.rejectedAt = null;
        this.rejectedBy = null;
        this.updatedAt = now;
    }

    /** SUBMITTED → APPROVED. */
    public void approve(UUID userId, Instant now) {
        this.status = StepStatus.APPROVED;
        this.approvedBy = userId;
        this.approvedAt = now;
        this.updatedAt = now;
    }

    /** SUBMITTED → REJECTED with the reason and the fields to correct (design v0.4 45, 47b). */
    public void reject(UUID userId, String reason, List<String> fields, Instant now) {
        this.status = StepStatus.REJECTED;
        this.rejectionReason = reason;
        this.rejectionFields = List.copyOf(fields);
        this.rejectedAt = now;
        this.rejectedBy = userId;
        this.updatedAt = now;
    }
}
