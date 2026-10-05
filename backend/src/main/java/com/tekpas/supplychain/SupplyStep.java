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
}
