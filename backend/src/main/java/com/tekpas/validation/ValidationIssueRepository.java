package com.tekpas.validation;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Every lookup takes the company id: an issue of another company is simply not found. */
public interface ValidationIssueRepository extends JpaRepository<ValidationIssue, UUID> {

    List<ValidationIssue> findByBatchIdAndCompanyId(UUID batchId, UUID companyId);

    Optional<ValidationIssue> findByIdAndCompanyId(UUID id, UUID companyId);

    /**
     * The issue's batch id (empty when there is no such issue in the company), read as a scalar so that the batch can
     * be locked before the issue is loaded: a check of the batch and a decision on one of its issues never interleave.
     */
    @Query("select i.batchId from ValidationIssue i where i.id = :id and i.companyId = :companyId")
    List<UUID> batchIdOf(UUID id, UUID companyId);
}
