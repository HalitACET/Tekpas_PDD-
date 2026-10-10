package com.tekpas.request;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** A request belongs to a company through its step's batch; the public side finds it by the token's hash. */
public interface DataRequestRepository extends JpaRepository<DataRequest, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<DataRequest> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from DataRequest r, com.tekpas.supplychain.SupplyStep s, com.tekpas.batch.Batch b
            where r.id = :id and s.id = r.stepId and b.id = s.batchId and b.companyId = :companyId
            """)
    Optional<DataRequest> lockForUpdate(UUID id, UUID companyId);

    List<DataRequest> findByStepIdAndStatusIn(UUID stepId, Collection<RequestStatus> statuses);

    /** Newest first, for the chain's per-step summary. */
    List<DataRequest> findByStepIdInOrderByCreatedAtDesc(Collection<UUID> stepIds);
}
