package com.tekpas.passport;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Every panel lookup filters by the company (CLAUDE.md rule 1); the public lookup is by (gtin, batch no), T3. */
public interface PassportRepository extends JpaRepository<Passport, UUID> {

    Optional<Passport> findByIdAndCompanyId(UUID id, UUID companyId);

    /** Row-locked, so a withdrawal and a new publishing cannot interleave on one version. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Passport p where p.id = :id and p.companyId = :companyId")
    Optional<Passport> lockByIdAndCompanyId(UUID id, UUID companyId);

    List<Passport> findByBatchIdAndCompanyIdOrderByVersionDesc(UUID batchId, UUID companyId);

    Optional<Passport> findFirstByBatchIdAndCompanyIdOrderByVersionDesc(UUID batchId, UUID companyId);

    /**
     * The public lookup (QR code): the newest version of the passport with this GTIN and batch number. Not filtered by
     * company on purpose: a GTIN is worldwide unique (M2) and the page is for everyone.
     */
    Optional<Passport> findFirstByGtinAndBatchNoOrderByVersionDesc(String gtin, String batchNo);

    Optional<Passport> findByBatchIdAndCompanyIdAndStatus(UUID batchId, UUID companyId, PassportStatus status);
}
