package com.tekpas.validation;

import com.tekpas.ai.AiException;
import com.tekpas.ai.LlmBudget;
import com.tekpas.ai.LlmGate;
import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.common.storage.FileStorage;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.document.Document;
import com.tekpas.document.DocumentRepository;
import com.tekpas.document.DocumentText;
import com.tekpas.document.reading.PdfText;
import com.tekpas.jobs.JobContext;
import com.tekpas.product.FiberShare;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import com.tekpas.validation.AiConsistencyCheck.Sheet;
import com.tekpas.validation.AiConsistencyCheck.Source;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs the AI checks of a batch after its rules (docs/m7-plan.md §8) and keeps the stored suggestions in step with
 * the answer ({@link IssueSync} with source AI; the rules' issues are not touched). Only when the {@link LlmGate}
 * opens for the company and today's {@link LlmBudget} allows a call, and only when the data sent has changed since
 * the last answer (its digest is kept on the batch). The LLM call runs outside any transaction; the result is
 * written under the batch's lock, like a rule check.
 */
@Service
public class AiValidationService {

    private static final Logger log = LoggerFactory.getLogger(AiValidationService.class);
    /** Characters of a document's text sent at most, and documents at most: a certificate's scope is on page 1–2. */
    static final int MAX_DOCUMENT_TEXT = 6_000;
    static final int MAX_DOCUMENTS = 8;

    private static final Comparator<SupplyStep> CHAIN_ORDER = Comparator.comparing(SupplyStep::getStepType)
            .thenComparingInt(SupplyStep::getSortOrder).thenComparing(SupplyStep::getCreatedAt)
            .thenComparing(SupplyStep::getId);

    private final BatchRepository batches;
    private final ProductRepository products;
    private final SupplyStepRepository steps;
    private final DocumentRepository documents;
    private final CompanyRepository companies;
    private final ValidationIssueRepository issues;
    private final FileStorage storage;
    private final LlmGate gate;
    private final LlmBudget budget;
    private final AiConsistencyCheck check;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;

    public AiValidationService(BatchRepository batches, ProductRepository products, SupplyStepRepository steps,
            DocumentRepository documents, CompanyRepository companies, ValidationIssueRepository issues,
            FileStorage storage, LlmGate gate, LlmBudget budget, AiConsistencyCheck check, ObjectMapper json,
            Clock clock, PlatformTransactionManager transactions) {
        this.batches = batches;
        this.products = products;
        this.steps = steps;
        this.documents = documents;
        this.companies = companies;
        this.issues = issues;
        this.storage = storage;
        this.gate = gate;
        this.budget = budget;
        this.check = check;
        this.json = json;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    /** What the sheet is built from, read in one transaction; the files are read after it. */
    private record Loaded(String lastDigest, Product product, List<SupplyStep> chain, Map<UUID, String> suppliers,
            List<Document> confirmed) {
    }

    /**
     * The job's work. Gives up quietly (the rules' result stands) when the gate is closed, the budget is used up, the
     * data has not changed or the LLM gives no answer on the last attempt.
     *
     * @throws AiException when the LLM is unavailable and another attempt may help
     */
    public void run(UUID companyId, UUID batchId, JobContext context) {
        if (!gate.opensFor(companyId)) {
            return;
        }
        Loaded loaded = tx.execute(status -> load(companyId, batchId));
        if (loaded == null) {
            return;
        }
        Sheet sheet = sheet(loaded);
        if (loaded.confirmed().isEmpty() && loaded.chain().stream().allMatch(s -> StepData.EMPTY.equals(s.getData()))) {
            // Nothing declared and nothing confirmed yet: the product alone has nothing to be checked against, and the
            // daily budget is kept for batches that have.
            return;
        }
        String digest = sha256(sheet.body());
        if (digest.equals(loaded.lastDigest())) {
            return;
        }
        if (!budget.tryAcquire()) {
            log.warn("LLM daily limit reached, the AI checks of batch {} are skipped", batchId);
            return;
        }
        List<Finding> found;
        try {
            found = check.check(sheet);
        } catch (AiException e) {
            if (e.retryable() && !context.lastAttempt()) {
                throw e;
            }
            log.warn("AI checks of batch {} gave up: {}", batchId, e.getMessage());
            return;
        }
        tx.executeWithoutResult(status -> batches.lockForUpdate(batchId, companyId).ifPresent(batch -> {
            Instant now = clock.instant();
            List<ValidationIssue> stored = issues.findByBatchIdAndCompanyId(batchId, companyId);
            IssueSync.Result result = IssueSync.apply(batchId, companyId, IssueSource.AI, stored, found, now);
            issues.saveAll(result.created());
            batch.markAiValidated(now, digest);
            batches.save(batch);
            log.info("AI checks of batch {}: {} new, {} seen, {} closed", batchId, result.created().size(),
                    result.seen(), result.closed());
        }));
    }

    private @Nullable Loaded load(UUID companyId, UUID batchId) {
        Batch batch = batches.findByIdAndCompanyId(batchId, companyId).orElse(null);
        if (batch == null) {
            return null;
        }
        Product product = products.findByIdAndCompanyId(batch.getProductId(), companyId).orElseThrow();
        List<SupplyStep> chain = steps.findByBatchId(batchId).stream().sorted(CHAIN_ORDER).toList();
        Map<UUID, String> suppliers = new HashMap<>();
        List<UUID> supplierIds = chain.stream().map(SupplyStep::getSupplierCompanyId).filter(id -> id != null)
                .distinct().toList();
        for (Company company : companies.findAllById(supplierIds)) {
            suppliers.put(company.getId(), company.getName());
        }
        List<UUID> stepIds = chain.stream().map(SupplyStep::getId).toList();
        // Only what a person confirmed is the batch's data (CLAUDE.md rule 5): a proposal is not checked against.
        List<Document> confirmed = stepIds.isEmpty() ? List.of()
                : documents.confirmedOfSteps(companyId, stepIds).stream()
                        .sorted(Comparator.comparing(Document::getCreatedAt).thenComparing(Document::getId))
                        .limit(MAX_DOCUMENTS).toList();
        return new Loaded(batch.getAiInputSha256() == null ? "" : batch.getAiInputSha256(), product, chain, suppliers,
                confirmed);
    }

    /** The data sheet: P, the steps S1… in chain order, the confirmed documents D1… with their text where any. */
    Sheet sheet(Loaded loaded) {
        List<Source> sources = new ArrayList<>();
        Product product = loaded.product();
        sources.add(new Source("P", IssueEvidence.Source.PRODUCT, null, null, null, null, null,
                "product \"" + product.getName() + "\"; category " + product.getCategory() + "; label fibre composition: "
                        + fibres(product.getDeclaredFiberComposition())));
        Map<UUID, String> stepRefs = new HashMap<>();
        int n = 0;
        for (SupplyStep step : loaded.chain()) {
            String ref = "S" + (++n);
            stepRefs.put(step.getId(), ref);
            String supplier = step.getSupplierCompanyId() == null ? null : loaded.suppliers().get(step.getSupplierCompanyId());
            String data = json.writeValueAsString(step.getData());
            sources.add(new Source(ref, IssueEvidence.Source.STEP, step.getId(), null, step.getStepType(), null,
                    supplier, "step " + step.getStepType() + "; supplier " + (supplier == null ? "not assigned" : supplier)
                            + "; declared " + data));
        }
        int d = 0;
        for (Document doc : loaded.confirmed()) {
            String ref = "D" + (++d);
            SupplyStep step = loaded.chain().stream().filter(s -> s.getId().equals(doc.getStepId())).findFirst()
                    .orElse(null);
            String supplier = step == null || step.getSupplierCompanyId() == null ? null
                    : loaded.suppliers().get(step.getSupplierCompanyId());
            String text = "confirmed document " + doc.getDocType() + " of " + stepRefs.getOrDefault(doc.getStepId(), "?")
                    + "; holder " + orNone(doc.getHolderName()) + "; number " + orNone(doc.getCertNo()) + "; issuer "
                    + orNone(doc.getIssuer()) + "; valid " + orNone(doc.getValidFrom()) + " to "
                    + orNone(doc.getValidUntil()) + "; text: " + documentText(doc);
            sources.add(new Source(ref, IssueEvidence.Source.DOCUMENT, doc.getStepId(), doc.getId(),
                    step == null ? null : step.getStepType(), doc.getDocType(), supplier, text));
        }
        return new Sheet(sources, product.getCategory().name());
    }

    /** The PDF's text layer, cut to the first pages' worth; a scan or a photo has none (it is not sent as a file). */
    private String documentText(Document doc) {
        if (!"application/pdf".equals(doc.getMimeType())) {
            return "(no text layer)";
        }
        try {
            String text = PdfText.pages(storage.read(doc.getFileKey())).stream().map(DocumentText::clean)
                    .filter(page -> page != null).collect(Collectors.joining("\n"));
            if (text.isBlank()) {
                return "(no text layer)";
            }
            return text.length() <= MAX_DOCUMENT_TEXT ? text : text.substring(0, MAX_DOCUMENT_TEXT);
        } catch (Exception e) {
            // A missing file or an unreadable PDF leaves the document's fields; the check runs without its text.
            log.warn("Text of document {} not available for the AI checks: {}", doc.getId(), e.getClass().getSimpleName());
            return "(not available)";
        }
    }

    private static String fibres(@Nullable List<FiberShare> composition) {
        if (composition == null || composition.isEmpty()) {
            return "not given";
        }
        return composition.stream().map(s -> s.fiber() + " " + s.percent() + "%").collect(Collectors.joining(", "));
    }

    private static String orNone(@Nullable Object value) {
        return value == null ? "-" : value.toString();
    }

    private String sha256(String body) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest((check.model() + "\n" + body).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
