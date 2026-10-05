package com.tekpas.supplychain;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** A step belongs to a company through its batch: every lookup joins the batch and filters by company. */
public interface SupplyStepRepository extends JpaRepository<SupplyStep, UUID> {

    List<SupplyStep> findByBatchId(UUID batchId);

    long countByBatchId(UUID batchId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select s from SupplyStep s, Batch b
            where s.id = :id and b.id = s.batchId and b.companyId = :companyId
            """)
    Optional<SupplyStep> lockForUpdate(UUID id, UUID companyId);

    /** Whether the company's own chains use this supplier (a link that is in use cannot be removed). */
    @Query("""
            select count(s) > 0 from SupplyStep s, Batch b
            where s.supplierCompanyId = :supplierId and b.id = s.batchId and b.companyId = :companyId
            """)
    boolean usesSupplier(UUID supplierId, UUID companyId);
}
