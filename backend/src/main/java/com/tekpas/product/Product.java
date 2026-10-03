package com.tekpas.product;

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

/** A product model (one GTIN). Passports are published per batch of a product. */
@Entity
@Table(name = "product")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private UUID companyId;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, length = 14)
    private String gtin;

    @Column(length = 60)
    private @Nullable String sku;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private ProductCategory category;

    private @Nullable String description;

    @JdbcTypeCode(SqlTypes.JSON)
    private @Nullable List<FiberShare> declaredFiberComposition;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Product() {
    }

    public Product(UUID companyId, String gtin, String name, ProductCategory category, Instant now) {
        this.companyId = companyId;
        this.gtin = gtin;
        this.name = name;
        this.category = category;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public String getGtin() {
        return gtin;
    }

    public void setGtin(String gtin) {
        this.gtin = gtin;
    }

    public @Nullable String getSku() {
        return sku;
    }

    public void setSku(@Nullable String sku) {
        this.sku = sku;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ProductCategory getCategory() {
        return category;
    }

    public void setCategory(ProductCategory category) {
        this.category = category;
    }

    public @Nullable String getDescription() {
        return description;
    }

    public void setDescription(@Nullable String description) {
        this.description = description;
    }

    public @Nullable List<FiberShare> getDeclaredFiberComposition() {
        return declaredFiberComposition;
    }

    public void setDeclaredFiberComposition(@Nullable List<FiberShare> declaredFiberComposition) {
        this.declaredFiberComposition = declaredFiberComposition == null ? null : List.copyOf(declaredFiberComposition);
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
