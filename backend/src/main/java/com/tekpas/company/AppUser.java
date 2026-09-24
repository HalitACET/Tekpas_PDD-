package com.tekpas.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class AppUser {

    @Id
    private UUID id;

    // Plain column instead of a relation: tenant filters stay simple (findByIdAndCompanyId).
    @Column(nullable = false)
    private UUID companyId;

    @Column(nullable = false, length = 200)
    private String email;

    @Column(nullable = false, length = 100)
    private String passwordHash;

    @Column(nullable = false, length = 150)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Column(nullable = false, length = 5)
    private String locale;

    @Column(nullable = false)
    private boolean active;

    private Instant lastLoginAt;

    @Column(insertable = false, updatable = false)
    private Instant createdAt;

    protected AppUser() {
    }

    public AppUser(UUID companyId, String email, String passwordHash, String fullName, UserRole role) {
        this.id = UUID.randomUUID();
        this.companyId = companyId;
        this.email = email;
        this.passwordHash = passwordHash;
        this.fullName = fullName;
        this.role = role;
        this.locale = "tr";
        this.active = true;
    }

    public void recordLogin(Instant at) {
        this.lastLoginAt = at;
    }

    public void deactivate() {
        this.active = false;
    }

    public UUID getId() {
        return id;
    }

    public UUID getCompanyId() {
        return companyId;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getFullName() {
        return fullName;
    }

    public UserRole getRole() {
        return role;
    }

    public String getLocale() {
        return locale;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
