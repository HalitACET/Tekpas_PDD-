package com.tekpas.validation;

import com.tekpas.ai.LlmGate;
import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.AppUserRepository;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.document.DocumentRepository;
import com.tekpas.document.DocumentRepository.RuleDocument;
import com.tekpas.document.ReviewStatus;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepType;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import com.tekpas.validation.ConsistencyRules.DocumentFacts;
import com.tekpas.validation.ConsistencyRules.Facts;
import com.tekpas.validation.ConsistencyRules.StepFacts;
import com.tekpas.validation.dto.IssueCounts;
import com.tekpas.validation.dto.IssueListResponse;
import com.tekpas.validation.dto.IssueResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Runs the rule checks of a batch and keeps the stored issues in step with them (docs/m7-plan.md §3), and takes a
 * person's decisions on them. Locks are taken in one order, the batch first and then its issues, so that a check and a
 * decision cannot wait for each other. Every lookup is filtered by the company; a batch or an issue of another company
 * is 404 (CLAUDE.md rule 1).
 */
@Service
public class ValidationService {

    private static final Logger log = LoggerFactory.getLogger(ValidationService.class);
    static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");
    private static final int NOTE_MAX = 500;

    private final BatchRepository batches;
    private final ProductRepository products;
    private final SupplyStepRepository steps;
    private final DocumentRepository documents;
    private final CompanyRepository companies;
    private final AppUserRepository users;
    private final ValidationIssueRepository issues;
    private final LlmGate gate;
    private final JobQueue jobs;
    private final Clock clock;

    public ValidationService(BatchRepository batches, ProductRepository products, SupplyStepRepository steps,
            DocumentRepository documents, CompanyRepository companies, AppUserRepository users,
            ValidationIssueRepository issues, LlmGate gate, JobQueue jobs, Clock clock) {
        this.batches = batches;
        this.products = products;
        this.steps = steps;
        this.documents = documents;
        this.companies = companies;
        this.users = users;
        this.issues = issues;
        this.gate = gate;
        this.jobs = jobs;
        this.clock = clock;
    }

    /** "Kontrolleri çalıştır": checks the batch, makes the stored issues say the same and answers with the open ones. */
    @Transactional
    public IssueListResponse validate(UUID companyId, UUID batchId) {
        Batch batch = batches.lockForUpdate(batchId, companyId).orElseThrow(() -> notFound());
        check(batch);
        return list(batch, IssueFilter.OPEN);
    }

    /**
     * Checks a batch the caller has locked and still holds the lock of (publishing does so before it scores), so
     * that what it reads is what it publishes.
     */
    @Transactional
    public void check(Batch batch) {
        Instant now = clock.instant();
        UUID companyId = batch.getCompanyId();
        List<Finding> found = ConsistencyRules.check(facts(batch), LocalDate.ofInstant(now, ZONE));
        List<ValidationIssue> stored = issues.findByBatchIdAndCompanyId(batch.getId(), companyId);
        IssueSync.Result result = IssueSync.apply(batch.getId(), companyId, IssueSource.RULE, stored, found, now);
        issues.saveAll(result.created());
        batch.markValidated(now);
        batches.save(batch);
        // Then the AI checks, where the LLM gate opens for the company (docs/m7-plan.md §8): suggestions only, after
        // the commit; an unchanged batch is not sent again.
        if (gate.opensFor(companyId)) {
            jobs.enqueueUnlessQueued(JobType.AI_VALIDATE_BATCH, new AiValidateBatchJob.Payload(companyId, batch.getId()));
        }
        log.debug("Checked batch {}: {} new, {} seen, {} closed, {} reopened", batch.getId(), result.created().size(),
                result.seen(), result.closed(), result.reopened());
    }

    /** The job's entry: checks the batch with its own lock; a batch deleted meanwhile is nothing to do. */
    @Transactional
    public void checkIfExists(UUID companyId, UUID batchId) {
        batches.lockForUpdate(batchId, companyId).ifPresent(this::check);
    }

    @Transactional(readOnly = true)
    public IssueListResponse list(UUID companyId, UUID batchId, IssueFilter filter) {
        Batch batch = batches.findByIdAndCompanyId(batchId, companyId).orElseThrow(() -> notFound());
        return list(batch, filter);
    }

    /** "Çözüldü": only WARNING and INFO; an ERROR leaves when the data is corrected. */
    @Transactional
    public IssueResponse resolve(UUID companyId, UUID userId, UUID issueId, @Nullable String note) {
        ValidationIssue issue = lockIssue(companyId, issueId);
        if (issue.isResolved()) {
            throw ConflictException.state("ALREADY_RESOLVED", "The issue is already resolved");
        }
        if (issue.getSeverity() == IssueSeverity.ERROR) {
            throw ConflictException.state("ISSUE_BLOCKING",
                    "A blocking issue cannot be resolved by hand; correct the data");
        }
        issue.resolve(userId, clean(note), clock.instant());
        return responses(List.of(issue)).getFirst();
    }

    /** "Geri aç": takes back a person's decision. One that closed itself is only reopened by the check finding it again. */
    @Transactional
    public IssueResponse reopen(UUID companyId, UUID issueId) {
        ValidationIssue issue = lockIssue(companyId, issueId);
        if (!issue.isResolved()) {
            throw ConflictException.state("NOT_RESOLVED", "The issue is open");
        }
        if (issue.isAutoResolved()) {
            throw ConflictException.state("AUTO_RESOLVED",
                    "The issue closed itself when the data was corrected; run the checks to find it again");
        }
        issue.reopen();
        return responses(List.of(issue)).getFirst();
    }

    /** The batch first, then the issue: the same order as a check. */
    private ValidationIssue lockIssue(UUID companyId, UUID issueId) {
        List<UUID> batchIds = issues.batchIdOf(issueId, companyId);
        if (batchIds.isEmpty()) {
            throw new NotFoundException("Issue not found");
        }
        batches.lockForUpdate(batchIds.getFirst(), companyId).orElseThrow(() -> new NotFoundException("Issue not found"));
        return issues.findByIdAndCompanyId(issueId, companyId).orElseThrow(() -> new NotFoundException("Issue not found"));
    }

    private IssueListResponse list(Batch batch, IssueFilter filter) {
        List<ValidationIssue> all = issues.findByBatchIdAndCompanyId(batch.getId(), batch.getCompanyId());
        int errors = 0;
        int warnings = 0;
        int infos = 0;
        int resolved = 0;
        for (ValidationIssue issue : all) {
            if (issue.isResolved()) {
                resolved++;
            } else if (issue.getSeverity() == IssueSeverity.ERROR) {
                errors++;
            } else if (issue.getSeverity() == IssueSeverity.WARNING) {
                warnings++;
            } else {
                infos++;
            }
        }
        List<ValidationIssue> shown = all.stream().filter(filter::accepts)
                .sorted(Comparator.comparing(ValidationIssue::getSeverity).reversed()
                        .thenComparing(Comparator.comparing(ValidationIssue::getCreatedAt).reversed())
                        .thenComparing(ValidationIssue::getId))
                .toList();
        return new IssueListResponse(responses(shown), new IssueCounts(errors, warnings, infos), resolved,
                batch.getValidatedAt());
    }

    private List<IssueResponse> responses(List<ValidationIssue> list) {
        Set<UUID> stepIds = new HashSet<>();
        Set<UUID> userIds = new HashSet<>();
        for (ValidationIssue issue : list) {
            if (issue.getStepId() != null) {
                stepIds.add(issue.getStepId());
            }
            if (issue.getResolvedBy() != null) {
                userIds.add(issue.getResolvedBy());
            }
        }
        Map<UUID, SupplyStep> stepsById = new HashMap<>();
        steps.findAllById(stepIds).forEach(s -> stepsById.put(s.getId(), s));
        Map<UUID, String> supplierNames = supplierNames(stepsById.values());
        Map<UUID, String> userNames = new HashMap<>();
        users.findAllById(userIds).forEach(u -> userNames.put(u.getId(), u.getFullName()));

        List<IssueResponse> result = new ArrayList<>();
        for (ValidationIssue issue : list) {
            SupplyStep step = issue.getStepId() == null ? null : stepsById.get(issue.getStepId());
            UUID supplierId = step == null ? null : step.getSupplierCompanyId();
            result.add(new IssueResponse(issue.getId(), issue.getCode(), issue.getSeverity(), issue.getSource(),
                    issue.getStepId(), step == null ? null : step.getStepType(),
                    supplierId == null ? null : supplierNames.get(supplierId), issue.getDocumentId(),
                    issue.getParams(), issue.isResolved(), issue.isAutoResolved(), issue.getResolvedAt(),
                    issue.getResolvedBy() == null ? null : userNames.get(issue.getResolvedBy()),
                    issue.getResolutionNote(), issue.getCreatedAt()));
        }
        return result;
    }

    // --- facts ------------------------------------------------------------------------------------------------------

    private Facts facts(Batch batch) {
        UUID companyId = batch.getCompanyId();
        Product product = products.findByIdAndCompanyId(batch.getProductId(), companyId)
                .orElseThrow(() -> new IllegalStateException("Product of batch " + batch.getId() + " not found"));
        List<SupplyStep> chain = steps.findByBatchId(batch.getId());
        List<UUID> stepIds = chain.stream().map(SupplyStep::getId).toList();

        Map<UUID, List<DocumentFacts>> docsByStep = new HashMap<>();
        if (!stepIds.isEmpty()) {
            for (RuleDocument d : documents.ruleDocumentsOf(companyId, stepIds)) {
                docsByStep.computeIfAbsent(d.getStepId(), id -> new ArrayList<>()).add(new DocumentFacts(d.getId(),
                        d.getDocType(), d.getReviewStatus() == ReviewStatus.VERIFIED, d.getValidUntil(),
                        d.getHolderName(), d.getOriginalName()));
            }
        }
        Map<UUID, String> supplierNames = supplierNames(chain);

        List<StepFacts> stepFacts = new ArrayList<>();
        for (SupplyStep step : chain) {
            StepData data = step.getData();
            UUID supplierId = step.getSupplierCompanyId();
            stepFacts.add(new StepFacts(step.getId(), step.getStepType(), step.getStatus(),
                    step.getStepType() == StepType.YARN || step.getStepType() == StepType.FABRIC
                            ? data.fiberComposition() : null,
                    supplierId == null ? null : supplierNames.get(supplierId),
                    docsByStep.getOrDefault(step.getId(), List.of())));
        }
        return new Facts(product.getDeclaredFiberComposition(), batch.getProducedFrom(), batch.getProducedTo(),
                stepFacts);
    }

    /** The names of the suppliers of these steps; the ids come from a batch of the caller's own company. */
    private Map<UUID, String> supplierNames(Collection<SupplyStep> chain) {
        Set<UUID> ids = new HashSet<>();
        for (SupplyStep step : chain) {
            if (step.getSupplierCompanyId() != null) {
                ids.add(step.getSupplierCompanyId());
            }
        }
        Map<UUID, String> names = new HashMap<>();
        for (Company company : companies.findAllById(ids)) {
            names.put(company.getId(), company.getName());
        }
        return names;
    }

    private static @Nullable String clean(@Nullable String note) {
        if (note == null || note.isBlank()) {
            return null;
        }
        String trimmed = note.strip();
        return trimmed.length() > NOTE_MAX ? trimmed.substring(0, NOTE_MAX) : trimmed;
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Batch not found");
    }
}
