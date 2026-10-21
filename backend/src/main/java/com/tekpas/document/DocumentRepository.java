package com.tekpas.document;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
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

    /**
     * The few columns the compliance score needs from the company's documents of these steps, in one query. The
     * company filter is repeated here: the step ids come from the caller's own batches, and so does the filter.
     */
    @Query("""
            select d.stepId as stepId, d.docType as docType, d.reviewStatus as reviewStatus,
                   d.validUntil as validUntil
            from Document d where d.companyId = :companyId and d.stepId in :stepIds
            """)
    List<ScoreDocument> scoreDocumentsOf(UUID companyId, Collection<UUID> stepIds);

    /** What the consistency rules read of the company's documents of these steps, in one query. */
    @Query("""
            select d.id as id, d.stepId as stepId, d.docType as docType, d.reviewStatus as reviewStatus,
                   d.validUntil as validUntil, d.holderName as holderName, d.originalName as originalName
            from Document d where d.companyId = :companyId and d.stepId in :stepIds
            """)
    List<RuleDocument> ruleDocumentsOf(UUID companyId, Collection<UUID> stepIds);

    /** The documents a person confirmed on these steps (the passport takes certificates from them), of the company. */
    @Query("""
            select d from Document d where d.companyId = :companyId and d.stepId in :stepIds
              and d.reviewStatus = com.tekpas.document.ReviewStatus.VERIFIED
            """)
    List<Document> confirmedOfSteps(UUID companyId, Collection<UUID> stepIds);

    /**
     * The company's documents whose reading is over and that nobody confirmed yet, newest first (M8 Görevlerim). A
     * document of a closed link that was never submitted has no step and is not listed.
     */
    @Query("""
            select d from Document d where d.companyId = :companyId and d.stepId is not null
              and d.reviewStatus = com.tekpas.document.ReviewStatus.UNREVIEWED
              and d.extractionStatus not in (com.tekpas.document.ExtractionStatus.QUEUED,
                                             com.tekpas.document.ExtractionStatus.RUNNING)
            order by d.createdAt desc, d.id
            """)
    List<Document> awaitingReview(UUID companyId, org.springframework.data.domain.Pageable page);

    /** @see #scoreDocumentsOf */
    interface ScoreDocument {

        UUID getStepId();

        DocType getDocType();

        ReviewStatus getReviewStatus();

        @Nullable LocalDate getValidUntil();
    }

    /** @see #ruleDocumentsOf */
    interface RuleDocument {

        UUID getId();

        UUID getStepId();

        DocType getDocType();

        ReviewStatus getReviewStatus();

        @Nullable LocalDate getValidUntil();

        @Nullable String getHolderName();

        String getOriginalName();
    }

    /** @see #countByStepIds */
    interface StepDocumentCounts {

        UUID getStepId();

        long getTotal();

        long getUnreviewed();
    }
}
