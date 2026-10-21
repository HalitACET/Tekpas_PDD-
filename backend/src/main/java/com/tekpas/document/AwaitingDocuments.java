package com.tekpas.document;

import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.document.Extraction.Field;
import com.tekpas.document.dto.AwaitingDocument;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The documents that wait for a person (docs/m8-plan.md §3.2): read, not confirmed, newest first. The batch and the
 * step are read for them in one query each; every lookup is the company's.
 */
@Service
public class AwaitingDocuments {

    static final int LIMIT = 50;
    /** A proposed value under this is shown yellow (the panel's rule). */
    static final double CONFIDENT = 0.8;

    private final DocumentRepository documents;
    private final SupplyStepRepository steps;
    private final BatchRepository batches;
    private final CompanyRepository companies;

    AwaitingDocuments(DocumentRepository documents, SupplyStepRepository steps, BatchRepository batches,
            CompanyRepository companies) {
        this.documents = documents;
        this.steps = steps;
        this.batches = batches;
        this.companies = companies;
    }

    @Transactional(readOnly = true)
    public List<AwaitingDocument> of(UUID companyId) {
        List<Document> waiting = documents.awaitingReview(companyId, PageRequest.of(0, LIMIT));
        Map<UUID, SupplyStep> stepsById = new HashMap<>();
        steps.findAllById(waiting.stream().map(Document::getStepId).filter(Objects::nonNull).distinct().toList())
                .forEach(s -> stepsById.put(s.getId(), s));
        Map<UUID, Batch> batchesById = new HashMap<>();
        batches.findAllById(stepsById.values().stream().map(SupplyStep::getBatchId).distinct().toList()).stream()
                .filter(b -> b.getCompanyId().equals(companyId)).forEach(b -> batchesById.put(b.getId(), b));
        Map<UUID, String> suppliers = new HashMap<>();
        for (Company company : companies.findAllById(stepsById.values().stream().map(SupplyStep::getSupplierCompanyId)
                .filter(Objects::nonNull).distinct().toList())) {
            suppliers.put(company.getId(), company.getName());
        }
        List<AwaitingDocument> result = new ArrayList<>();
        for (Document d : waiting) {
            SupplyStep step = stepsById.get(d.getStepId());
            Batch batch = step == null ? null : batchesById.get(step.getBatchId());
            if (step == null || batch == null) {
                continue;
            }
            List<Field> fields = fields(d.getExtraction());
            result.add(new AwaitingDocument(d.getId(), d.getDocType(), d.getOriginalName(), d.getExtractionStatus(),
                    d.getExtractionMethod(), fields.size(),
                    (int) fields.stream().filter(f -> f.confidence() < CONFIDENT).count(), d.getUploadedByName(),
                    d.getCreatedAt(), step.getId(), step.getStepType(),
                    step.getSupplierCompanyId() == null ? null : suppliers.get(step.getSupplierCompanyId()),
                    batch.getId(), batch.getBatchNo(), batch.getStatus()));
        }
        return result;
    }

    private static List<Field> fields(Extraction extraction) {
        if (extraction == null) {
            return List.of();
        }
        Extraction.Fields f = extraction.fields();
        return Stream.of(f.certNo(), f.holderName(), f.issuer(), f.validFrom(), f.validUntil())
                .filter(Objects::nonNull).toList();
    }
}
