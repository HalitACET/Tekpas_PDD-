package com.tekpas.document;

import com.tekpas.batch.BatchRepository;
import com.tekpas.batch.BatchStatus;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.web.RateLimiter;
import com.tekpas.company.AppUserRepository;
import com.tekpas.document.DocumentStore.Target;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.document.dto.DocumentResponse;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * The manufacturer's side of documents (design v0.5 56–58): upload to a step, list, read, download link and
 * removal. Every lookup filters by the caller's company; another company's step or document is a 404.
 */
@Service
public class DocumentService {

    /** Documents on one step, whoever uploaded them: a safety cap for the free storage tier (1 GB). */
    static final int MAX_PER_STEP = 10;
    static final int UPLOADS_PER_COMPANY_PER_HOUR = 60;
    static final Duration DOWNLOAD_LINK_TTL = Duration.ofSeconds(60);

    private final DocumentRepository documents;
    private final SupplyStepRepository steps;
    private final BatchRepository batches;
    private final AppUserRepository users;
    private final StepEvents events;
    private final FileStorage storage;
    private final FileInspector inspector;
    private final DocumentStore store;
    private final RateLimiter limiter;
    private final TransactionTemplate tx;

    public DocumentService(DocumentRepository documents, SupplyStepRepository steps, BatchRepository batches,
            AppUserRepository users, StepEvents events, FileStorage storage, FileInspector inspector,
            DocumentStore store, RateLimiter limiter, PlatformTransactionManager transactions) {
        this.documents = documents;
        this.steps = steps;
        this.batches = batches;
        this.users = users;
        this.events = events;
        this.storage = storage;
        this.inspector = inspector;
        this.store = store;
        this.limiter = limiter;
        this.tx = new TransactionTemplate(transactions);
    }

    /** Not transactional on purpose: the file transfer must not hold a connection (see {@link DocumentStore}). */
    public DocumentResponse upload(UUID companyId, UUID userId, UUID stepId, MultipartFile file,
            @Nullable DocType docType) {
        // Counted before the file is looked at, so rejected files use up the allowance too.
        limiter.hit("document-upload", companyId.toString(), UPLOADS_PER_COMPANY_PER_HOUR, Duration.ofHours(1));
        InspectedFile inspected = inspector.inspect(file);
        Document saved = store.save(inspected, docType == null ? DocType.UNKNOWN : docType, () -> {
            SupplyStep step = steps.lockForUpdate(stepId, companyId)
                    .orElseThrow(() -> new NotFoundException("Step not found"));
            if (batches.findById(step.getBatchId()).map(b -> b.getStatus() == BatchStatus.PUBLISHED).orElse(false)) {
                throw ConflictException.state("BATCH_PUBLISHED", "The batch is published; its documents cannot change");
            }
            requireRoom(step.getId(), inspected.sha256());
            String name = users.findById(userId).map(u -> u.getFullName()).orElse(null);
            return new Target(companyId, step.getId(), null, userId, name);
        });
        return DocumentResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(UUID companyId, UUID stepId) {
        steps.findOfCompany(stepId, companyId).orElseThrow(() -> new NotFoundException("Step not found"));
        return documents.findByStepIdAndCompanyIdOrderByCreatedAtDesc(stepId, companyId).stream()
                .map(DocumentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public DocumentResponse get(UUID companyId, UUID documentId) {
        return DocumentResponse.from(find(companyId, documentId));
    }

    /** A short signed link to the file (or the file's own URI with the local provider, see the controller). */
    @Transactional(readOnly = true)
    public FileLink fileLink(UUID companyId, UUID documentId, boolean asDownload) {
        Document d = find(companyId, documentId);
        URI url = storage.signedDownloadUrl(d.getFileKey(), DOWNLOAD_LINK_TTL, asDownload ? d.getOriginalName() : null);
        return new FileLink(url, d.getMimeType(), d.getOriginalName());
    }

    /** What the download endpoint needs to answer. */
    public record FileLink(URI url, String mimeType, String fileName) {
    }

    /** A document nobody confirmed yet can go; one that was verified feeds the step's data and stays. */
    public void remove(UUID companyId, UUID userId, UUID documentId) {
        String key = tx.execute(status -> {
            Document d = find(companyId, documentId);
            if (d.getReviewStatus() == ReviewStatus.VERIFIED) {
                throw ConflictException.state("DOCUMENT_VERIFIED", "A verified document cannot be removed");
            }
            if (d.getStepId() != null) {
                SupplyStep step = steps.lockForUpdate(d.getStepId(), companyId).orElse(null);
                if (step != null && batches.findById(step.getBatchId())
                        .map(b -> b.getStatus() == BatchStatus.PUBLISHED).orElse(false)) {
                    throw ConflictException.state("BATCH_PUBLISHED",
                            "The batch is published; its documents cannot change");
                }
                String name = users.findById(userId).map(u -> u.getFullName()).orElse(null);
                events.record(d.getStepId(), d.getRequestId(), StepEventKind.DOCUMENT_REMOVED, userId, name,
                        Map.of("documentId", d.getId().toString(), "docType", d.getDocType().name()));
            }
            documents.delete(d);
            return d.getFileKey();
        });
        store.discard(key);
    }

    /** Limit and duplicate rules shared by the panel and link uploads (the caller holds the step's lock). */
    void requireRoom(UUID stepId, String sha256) {
        if (documents.countByStepId(stepId) >= MAX_PER_STEP) {
            throw ConflictException.state("DOCUMENT_LIMIT", "A step holds at most " + MAX_PER_STEP + " documents");
        }
        if (documents.existsByStepIdAndSha256(stepId, sha256)) {
            throw ConflictException.state("DUPLICATE_DOCUMENT", "This file is already uploaded for the step");
        }
    }

    private Document find(UUID companyId, UUID documentId) {
        return documents.findByIdAndCompanyId(documentId, companyId)
                .orElseThrow(() -> new NotFoundException("Document not found"));
    }
}
