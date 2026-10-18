package com.tekpas.document;

import com.tekpas.ai.LlmGate;
import com.tekpas.batch.BatchRepository;
import com.tekpas.batch.BatchStatus;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.web.RateLimiter;
import com.tekpas.company.AppUserRepository;
import com.tekpas.document.DocumentStore.Target;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.document.dto.DocumentResponse;
import com.tekpas.document.dto.VerifyDocumentRequest;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * The manufacturer's side of documents (design v0.5 56–58): upload to a step, list, read, download link,
 * removal and the confirmation of what was read. Every lookup filters by the caller's company; another company's
 * step or document is a 404.
 */
@Service
public class DocumentService {

    /** Documents on one step, whoever uploaded them: a safety cap for the free storage tier (1 GB). */
    static final int MAX_PER_STEP = 10;
    static final int UPLOADS_PER_COMPANY_PER_HOUR = 60;
    static final int REREADS_PER_COMPANY_PER_HOUR = 30;
    static final Duration DOWNLOAD_LINK_TTL = Duration.ofSeconds(60);

    private final DocumentRepository documents;
    private final SupplyStepRepository steps;
    private final BatchRepository batches;
    private final AppUserRepository users;
    private final StepEvents events;
    private final FileStorage storage;
    private final FileInspector inspector;
    private final DocumentStore store;
    private final JobQueue jobs;
    private final LlmGate gate;
    private final RateLimiter limiter;
    private final Clock clock;
    private final TransactionTemplate tx;

    public DocumentService(DocumentRepository documents, SupplyStepRepository steps, BatchRepository batches,
            AppUserRepository users, StepEvents events, FileStorage storage, FileInspector inspector,
            DocumentStore store, JobQueue jobs, LlmGate gate, RateLimiter limiter, Clock clock,
            PlatformTransactionManager transactions) {
        this.documents = documents;
        this.steps = steps;
        this.batches = batches;
        this.users = users;
        this.events = events;
        this.storage = storage;
        this.inspector = inspector;
        this.store = store;
        this.jobs = jobs;
        this.gate = gate;
        this.limiter = limiter;
        this.clock = clock;
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
        return DocumentResponse.from(saved, null, false);
    }

    @Transactional(readOnly = true)
    public List<DocumentResponse> list(UUID companyId, UUID stepId) {
        steps.findOfCompany(stepId, companyId).orElseThrow(() -> new NotFoundException("Step not found"));
        return respond(companyId, documents.findByStepIdAndCompanyIdOrderByCreatedAtDesc(stepId, companyId));
    }

    @Transactional(readOnly = true)
    public DocumentResponse get(UUID companyId, UUID documentId) {
        return respond(companyId, List.of(find(companyId, documentId))).getFirst();
    }

    /**
     * A person confirms a document: the values they send become its real fields and its type, and the check of
     * every field (accepted, edited, added) is kept for the accuracy figure. Only OWNER and ADMIN (the controller);
     * a published batch and an already confirmed document are 409, a document still being read is 409 too (its
     * proposal is not final). The reading's {@code extraction} is never touched.
     */
    @Transactional
    public DocumentResponse verify(UUID companyId, UUID userId, UUID documentId, VerifyDocumentRequest request) {
        // Step first, then the document: the same order as upload and removal, so they cannot deadlock.
        List<UUID> stepIds = documents.stepIdOf(documentId, companyId);
        if (stepIds.isEmpty()) {
            throw new NotFoundException("Document not found");
        }
        UUID stepId = stepIds.getFirst();
        if (stepId != null) {
            SupplyStep step = steps.lockForUpdate(stepId, companyId).orElse(null);
            if (step != null && batches.findById(step.getBatchId())
                    .map(b -> b.getStatus() == BatchStatus.PUBLISHED).orElse(false)) {
                throw ConflictException.state("BATCH_PUBLISHED", "The batch is published; its documents cannot change");
            }
        }
        Document d = documents.lockByIdAndCompanyId(documentId, companyId)
                .orElseThrow(() -> new NotFoundException("Document not found"));
        if (d.getReviewStatus() == ReviewStatus.VERIFIED) {
            throw ConflictException.state("DOCUMENT_VERIFIED", "This document is already verified");
        }
        if (d.awaitsReading()) {
            throw ConflictException.state("DOCUMENT_NOT_READ", "The document is still being read");
        }
        if (request.docType() == DocType.UNKNOWN) {
            throw new InvalidFieldsException(new FieldViolation("docType", "OneOf", "Choose the document's type"));
        }
        if (request.validFrom() != null && request.validUntil() != null
                && request.validUntil().isBefore(request.validFrom())) {
            throw new InvalidFieldsException(new FieldViolation("validUntil", "DateRange",
                    "Must not be before validFrom"));
        }
        String certNo = DocumentText.clean(request.certNo());
        String holder = DocumentText.clean(request.holderName());
        String issuer = DocumentText.clean(request.issuer());
        if (request.docType().isCertificate()) {
            List<String> missing = new ArrayList<>();
            if (certNo == null) {
                missing.add("certNo");
            }
            if (request.validUntil() == null) {
                missing.add("validUntil");
            }
            if (!missing.isEmpty()) {
                throw new IncompleteCertificateException(missing);
            }
        }
        Extraction proposal = d.getExtraction();
        Extraction.Fields fields = proposal == null ? Extraction.Fields.none() : proposal.fields();
        DocType detected = proposal == null || proposal.detectedType() == DocType.UNKNOWN ? null
                : proposal.detectedType();
        Verification verification = new Verification(
                Verification.of(detected, request.docType()),
                Verification.of(textOf(fields.certNo()), certNo),
                Verification.of(textOf(fields.holderName()), holder),
                Verification.of(textOf(fields.issuer()), issuer),
                Verification.of(textOf(fields.validFrom()), request.validFrom() == null ? null
                        : request.validFrom().toString()),
                Verification.of(textOf(fields.validUntil()), request.validUntil() == null ? null
                        : request.validUntil().toString()));
        d.verify(request.docType(), certNo, holder, issuer, request.validFrom(), request.validUntil(), verification,
                userId, clock.instant());
        String name = users.findById(userId).map(u -> u.getFullName()).orElse(null);
        if (stepId != null) {
            events.record(stepId, d.getRequestId(), StepEventKind.DOCUMENT_VERIFIED, userId, name,
                    Map.of("documentId", d.getId().toString(), "docType", d.getDocType().name()));
        }
        return DocumentResponse.from(d, name, false);
    }

    /**
     * A reading is queued again ("Tekrar oku", design v0.5 57e). A FAILED reading always qualifies; an UNREADABLE one
     * only while the {@link LlmGate} is open for the company (the LLM may read what the rules could not, e.g. once it
     * was switched on for the demo). One that was read, one in progress and a confirmed document have nothing to
     * redo. The same locks and order as {@link #verify}; a published batch is frozen.
     */
    @Transactional
    public DocumentResponse reread(UUID companyId, UUID documentId) {
        limiter.hit("document-reread", companyId.toString(), REREADS_PER_COMPANY_PER_HOUR, Duration.ofHours(1));
        List<UUID> stepIds = documents.stepIdOf(documentId, companyId);
        if (stepIds.isEmpty()) {
            throw new NotFoundException("Document not found");
        }
        UUID stepId = stepIds.getFirst();
        if (stepId != null) {
            SupplyStep step = steps.lockForUpdate(stepId, companyId).orElse(null);
            if (step != null && batches.findById(step.getBatchId())
                    .map(b -> b.getStatus() == BatchStatus.PUBLISHED).orElse(false)) {
                throw ConflictException.state("BATCH_PUBLISHED", "The batch is published; its documents cannot change");
            }
        }
        Document d = documents.lockByIdAndCompanyId(documentId, companyId)
                .orElseThrow(() -> new NotFoundException("Document not found"));
        boolean llmOpen = d.getExtractionStatus() == ExtractionStatus.UNREADABLE && gate.opensFor(companyId);
        if (!d.rereadable(llmOpen)) {
            throw ConflictException.state("DOCUMENT_NOT_REREADABLE",
                    "Only a reading that failed, or one left to manual entry while the AI reading is on, can be tried again");
        }
        d.requeueReading();
        jobs.enqueue(JobType.AI_EXTRACT_DOCUMENT, new ExtractDocument(d.getId()));
        return DocumentResponse.from(d, null, false);
    }

    private static @Nullable String textOf(Extraction.@Nullable Field field) {
        return field == null ? null : DocumentText.clean(field.value());
    }

    /** The responses with the verifiers' names (one lookup for the whole list). */
    private List<DocumentResponse> respond(UUID companyId, List<Document> list) {
        // The gate is looked up only when a document could use it (an unreadable one), and once for the list.
        boolean llmOpen = list.stream().anyMatch(d -> d.getExtractionStatus() == ExtractionStatus.UNREADABLE)
                && gate.opensFor(companyId);
        Set<UUID> verifierIds = list.stream().map(Document::getVerifiedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> names = new HashMap<>();
        users.findAllById(verifierIds).forEach(u -> names.put(u.getId(), u.getFullName()));
        return list.stream().map(d -> DocumentResponse.from(d, d.getVerifiedBy() == null ? null
                : names.get(d.getVerifiedBy()), llmOpen)).toList();
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
