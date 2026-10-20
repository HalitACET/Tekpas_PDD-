package com.tekpas.batch;

import com.tekpas.batch.ComplianceScore.DocumentFacts;
import com.tekpas.batch.ComplianceScore.ProductFacts;
import com.tekpas.batch.ComplianceScore.StepFacts;
import com.tekpas.batch.dto.ScoreResponse;
import com.tekpas.document.DocumentRepository;
import com.tekpas.document.DocumentRepository.ScoreDocument;
import com.tekpas.document.ReviewStatus;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import com.tekpas.validation.OpenIssueCounts;
import com.tekpas.validation.dto.IssueCounts;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Loads what {@link ComplianceScore} needs for many batches in three queries (steps, products, documents) and
 * hands it over. Every lookup is filtered by the company; a batch of another company never gets here (404 earlier).
 */
@Component
class ComplianceService {

    /** The batch's own facts; the rest is read from the steps, the product and the documents. */
    record Target(UUID batchId, UUID productId, @Nullable LocalDate producedFrom, @Nullable LocalDate producedTo) {

        static Target of(BatchRow row) {
            return new Target(row.id(), row.productId(), row.producedFrom(), row.producedTo());
        }

        static Target of(Batch batch) {
            return new Target(batch.getId(), batch.getProductId(), batch.getProducedFrom(), batch.getProducedTo());
        }
    }

    private static final Comparator<SupplyStep> CHAIN_ORDER = Comparator.comparing(SupplyStep::getStepType)
            .thenComparingInt(SupplyStep::getSortOrder).thenComparing(SupplyStep::getCreatedAt)
            .thenComparing(SupplyStep::getId);

    private final SupplyStepRepository steps;
    private final ProductRepository products;
    private final DocumentRepository documents;
    private final OpenIssueCounts openIssues;
    private final Clock clock;

    ComplianceService(SupplyStepRepository steps, ProductRepository products, DocumentRepository documents,
            OpenIssueCounts openIssues, Clock clock) {
        this.steps = steps;
        this.products = products;
        this.documents = documents;
        this.openIssues = openIssues;
        this.clock = clock;
    }

    Map<UUID, ScoreResponse> of(UUID companyId, Collection<Target> targets) {
        Map<UUID, ScoreResponse> result = new HashMap<>();
        if (targets.isEmpty()) {
            return result;
        }
        LocalDate today = LocalDate.ofInstant(clock.instant(), BatchNumbers.ZONE);

        Map<UUID, List<SupplyStep>> stepsByBatch = new HashMap<>();
        steps.findByBatchIdIn(targets.stream().map(Target::batchId).toList())
                .forEach(s -> stepsByBatch.computeIfAbsent(s.getBatchId(), id -> new ArrayList<>()).add(s));
        List<UUID> stepIds = stepsByBatch.values().stream().flatMap(List::stream).map(SupplyStep::getId).toList();

        Map<UUID, List<DocumentFacts>> docsByStep = new HashMap<>();
        if (!stepIds.isEmpty()) {
            for (ScoreDocument d : documents.scoreDocumentsOf(companyId, stepIds)) {
                docsByStep.computeIfAbsent(d.getStepId(), id -> new ArrayList<>()).add(new DocumentFacts(d.getDocType(),
                        d.getReviewStatus() == ReviewStatus.VERIFIED, d.getValidUntil()));
            }
        }

        Map<UUID, Product> productsById = new LinkedHashMap<>();
        products.findByCompanyIdAndIdIn(companyId, targets.stream().map(Target::productId).distinct().toList())
                .forEach(p -> productsById.put(p.getId(), p));

        Map<UUID, IssueCounts> open = openIssues.of(companyId, targets.stream().map(Target::batchId).toList());

        for (Target target : targets) {
            Product product = productsById.get(target.productId());
            if (product == null) {
                // Cannot happen (a batch's product is its company's); fail loudly rather than score a guess.
                throw new IllegalStateException("Product of batch " + target.batchId() + " not found");
            }
            List<StepFacts> chain = stepsByBatch.getOrDefault(target.batchId(), List.of()).stream().sorted(CHAIN_ORDER)
                    .map(s -> new StepFacts(s.getId(), s.getStepType(), s.getStatus(), s.getData(),
                            docsByStep.getOrDefault(s.getId(), List.of())))
                    .toList();
            IssueCounts counts = open.getOrDefault(target.batchId(), IssueCounts.NONE);
            result.put(target.batchId(), ComplianceScore.compute(chain, new ProductFacts(
                    product.getDeclaredFiberComposition(), product.getCategory(), target.producedFrom(),
                    target.producedTo()), today, counts.errors(), counts.warnings()));
        }
        return result;
    }

    ScoreResponse of(UUID companyId, Target target) {
        return of(companyId, List.of(target)).get(target.batchId());
    }
}
