package com.tekpas.batch;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Every query takes the company id: a batch of another company is simply not found. */
public interface BatchRepository extends JpaRepository<Batch, UUID> {

    Optional<Batch> findByIdAndCompanyId(UUID id, UUID companyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Batch b where b.id = :id and b.companyId = :companyId")
    Optional<Batch> lockForUpdate(UUID id, UUID companyId);

    long countByProductId(UUID productId);

    @Query("""
            select new com.tekpas.batch.BatchRow(b.id, b.batchNo, p.id, p.name, p.gtin, b.productionOrderNo,
                b.status, b.quantity, b.producedFrom, b.producedTo, b.createdAt, b.updatedAt)
            from Batch b join Product p on p.id = b.productId
            where b.id = :id and b.companyId = :companyId
            """)
    Optional<BatchRow> findRow(UUID id, UUID companyId);

    /**
     * @param q a LIKE pattern from {@code PageQuery.containsPattern}, matched against batch no, production order
     *     no, product name and GTIN
     * @param supplierId batches with at least one step of this supplier, each batch once
     */
    @Query(value = """
            select new com.tekpas.batch.BatchRow(b.id, b.batchNo, p.id, p.name, p.gtin, b.productionOrderNo,
                b.status, b.quantity, b.producedFrom, b.producedTo, b.createdAt, b.updatedAt)
            from Batch b join Product p on p.id = b.productId
            where b.companyId = :companyId
              and (:productId is null or b.productId = :productId)
              and (:status is null or b.status = :status)
              and (:supplierId is null or exists (select 1 from SupplyStep s
                   where s.batchId = b.id and s.supplierCompanyId = :supplierId))
              and (:q is null or b.batchNo ilike :q escape '\\' or b.productionOrderNo ilike :q escape '\\'
                   or p.name ilike :q escape '\\' or p.gtin like :q escape '\\')
            """,
            countQuery = """
            select count(b) from Batch b join Product p on p.id = b.productId
            where b.companyId = :companyId
              and (:productId is null or b.productId = :productId)
              and (:status is null or b.status = :status)
              and (:supplierId is null or exists (select 1 from SupplyStep s
                   where s.batchId = b.id and s.supplierCompanyId = :supplierId))
              and (:q is null or b.batchNo ilike :q escape '\\' or b.productionOrderNo ilike :q escape '\\'
                   or p.name ilike :q escape '\\' or p.gtin like :q escape '\\')
            """)
    Page<BatchRow> search(UUID companyId, @Nullable UUID productId, @Nullable BatchStatus status,
            @Nullable UUID supplierId, @Nullable String q, Pageable pageable);
}
