package com.tekpas.batch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** A production batch (production order) of a product. The passport level (K11). */
@Entity
@Table(name = "batch")
public class Batch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID productId;

    @Column(nullable = false, updatable = false)
    private UUID companyId;

    @Column(nullable = false, length = 20)
    private String batchNo;

    @Column(length = 50)
    private @Nullable String productionOrderNo;

    @Column(nullable = false)
    private int quantity;

    private @Nullable LocalDate producedFrom;

    private @Nullable LocalDate producedTo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BatchStatus status;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Batch() {
    }

    public Batch(UUID productId, UUID companyId, String batchNo, int quantity, Instant now) {
        this.productId = productId;
        this.companyId = companyId;
        this.batchNo = batchNo;
        this.quantity = quantity;
        this.status = BatchStatus.DRAFT;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getProductId() {
        return productId;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public String getBatchNo() {
        return batchNo;
    }

    public void setBatchNo(String batchNo) {
        this.batchNo = batchNo;
    }

    public @Nullable String getProductionOrderNo() {
        return productionOrderNo;
    }

    public void setProductionOrderNo(@Nullable String productionOrderNo) {
        this.productionOrderNo = productionOrderNo;
    }

    public int getQuantity() {
        return quantity;
    }

    public void setQuantity(int quantity) {
        this.quantity = quantity;
    }

    public @Nullable LocalDate getProducedFrom() {
        return producedFrom;
    }

    public void setProducedFrom(@Nullable LocalDate producedFrom) {
        this.producedFrom = producedFrom;
    }

    public @Nullable LocalDate getProducedTo() {
        return producedTo;
    }

    public void setProducedTo(@Nullable LocalDate producedTo) {
        this.producedTo = producedTo;
    }

    public BatchStatus getStatus() {
        return status;
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
