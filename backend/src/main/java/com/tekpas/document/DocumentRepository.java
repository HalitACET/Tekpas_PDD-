package com.tekpas.document;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** A document belongs to the manufacturer's company; every panel lookup filters by it. */
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    Optional<Document> findByIdAndCompanyId(UUID id, UUID companyId);

    /**
     * The document's step id (null when it has none); an empty list means no such document in the company. Read as
     * a scalar so that no stale entity is left in the session before the locks are taken (step first, then document).
     */
    @Query("select d.stepId from Document d where d.id = :id and d.companyId = :companyId")
    List<UUID> stepIdOf(UUID id, UUID companyId);

    /** Row-locked, so two confirmations (or a confirmation and a removal) cannot interleave. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Document d where d.id = :id and d.companyId = :companyId")
    Optional<Document> lockByIdAndCompanyId(UUID id, UUID companyId);

    List<Document> findByStepIdAndCompanyIdOrderByCreatedAtDesc(UUID stepId, UUID companyId);

    /** What a link holder sees: documents uploaded through links of the step, oldest first. */
    List<Document> findByStepIdAndRequestIdIsNotNullOrderByCreatedAtAsc(UUID stepId);

    Optional<Document> findByIdAndRequestId(UUID id, UUID requestId);

    long countByStepId(UUID stepId);

    long countByRequestId(UUID requestId);

    boolean existsByStepIdAndSha256(UUID stepId, String sha256);

    /** Documents per step (the chain's counts), in one query. */
    @Query("""
            select d.stepId as stepId, count(d) as total,
                   sum(case when d.reviewStatus = com.tekpas.document.ReviewStatus.UNREVIEWED then 1 else 0 end) as unreviewed
            from Document d where d.stepId in :stepIds group by d.stepId
            """)
    List<StepDocumentCounts> countByStepIds(Collection<UUID> stepIds);

    /** @see #countByStepIds */
    interface StepDocumentCounts {

        UUID getStepId();

        long getTotal();

        long getUnreviewed();
    }
}
