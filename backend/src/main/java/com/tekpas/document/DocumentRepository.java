package com.tekpas.document;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** A document belongs to the manufacturer's company; every panel lookup filters by it. */
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    Optional<Document> findByIdAndCompanyId(UUID id, UUID companyId);

    List<Document> findByStepIdAndCompanyIdOrderByCreatedAtDesc(UUID stepId, UUID companyId);

    /** What a link holder sees: documents uploaded through links of the step, oldest first. */
    List<Document> findByStepIdAndRequestIdIsNotNullOrderByCreatedAtAsc(UUID stepId);

    Optional<Document> findByIdAndRequestId(UUID id, UUID requestId);

    long countByStepId(UUID stepId);

    long countByRequestId(UUID requestId);

    boolean existsByStepIdAndSha256(UUID stepId, String sha256);
}
