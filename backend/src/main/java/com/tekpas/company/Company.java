package com.tekpas.company;

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

@Entity
@Table(name = "company")
public class Company {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private CompanyType type;

    @Column(length = 20)
    private String taxNo;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(nullable = false, length = 2)
    private String country;

    @Column(length = 100)
    private String city;

    @Column(insertable = false, updatable = false)
    private Instant createdAt;

    protected Company() {
    }

    public Company(String name, CompanyType type, String city) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.type = type;
        this.country = "TR";
        this.city = city;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public CompanyType getType() {
        return type;
    }

    public String getTaxNo() {
        return taxNo;
    }

    public String getCountry() {
        return country;
    }

    public String getCity() {
        return city;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
