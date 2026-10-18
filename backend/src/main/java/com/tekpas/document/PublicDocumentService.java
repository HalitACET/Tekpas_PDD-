package com.tekpas.document;

import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.CompanyRepository;
import com.tekpas.document.DocumentStore.Target;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.document.dto.PublicDocument;
import com.tekpas.request.PublicRequestService;
import com.tekpas.request.PublicRequestService.OpenLink;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Documents through a data request link (design v0.5 49–55). The holder can add and, before submitting, remove
 * their own uploads; they never learn what was read from them. Only an open link accepts anything: an expired,
 * revoked or submitted link answers like the form does (404/410).
 */
@Service
public class PublicDocumentService {

    /** Per link; the step's own cap (10) applies on top. */
    static final int MAX_PER_LINK = 5;

    private final PublicRequestService links;
    private final DocumentService panel;
    private final DocumentRepository documents;
    private final CompanyRepository companies;
    private final StepEvents events;
    private final FileInspector inspector;
    private final DocumentStore store;
    private final TransactionTemplate tx;

    public PublicDocumentService(PublicRequestService links, DocumentService panel, DocumentRepository documents,
            CompanyRepository companies, StepEvents events, FileInspector inspector, DocumentStore store,
            PlatformTransactionManager transactions) {
        this.links = links;
        this.panel = panel;
        this.documents = documents;
        this.companies = companies;
        this.events = events;
        this.inspector = inspector;
        this.store = store;
        this.tx = new TransactionTemplate(transactions);
    }

    /** Not transactional on purpose, like the panel upload (see {@link DocumentStore}). */
    public PublicDocument upload(@Nullable String token, MultipartFile file) {
        InspectedFile inspected = inspector.inspect(file);
        Document saved = store.save(inspected, DocType.UNKNOWN, () -> {
            OpenLink link = links.requireOpen(token);
            if (documents.countByRequestId(link.request().getId()) >= MAX_PER_LINK) {
                throw ConflictException.state("DOCUMENT_LIMIT", "A link takes at most " + MAX_PER_LINK + " documents");
            }
            panel.requireRoom(link.step().getId(), inspected.sha256());
            return new Target(link.companyId(), link.step().getId(), link.request().getId(), null,
                    supplierName(link));
        });
        return new PublicDocument(saved.getId(), saved.getOriginalName(), saved.getSizeBytes(), saved.getCreatedAt(),
                false);
    }

    /** Only the link's own uploads, and only while the link is open. */
    public void remove(@Nullable String token, UUID documentId) {
        String key = tx.execute(status -> {
            OpenLink link = links.requireOpen(token);
            Document d = documents.findByIdAndRequestId(documentId, link.request().getId())
                    .orElseThrow(() -> new NotFoundException("Document not found"));
            events.record(link.step().getId(), link.request().getId(), StepEventKind.DOCUMENT_REMOVED, null,
                    supplierName(link), Map.of("documentId", d.getId().toString(), "docType", d.getDocType().name()));
            documents.delete(d);
            return d.getFileKey();
        });
        store.discard(key);
    }

    private @Nullable String supplierName(OpenLink link) {
        UUID supplier = link.supplierCompanyId();
        return supplier == null ? null : companies.findById(supplier).map(c -> c.getName()).orElse(null);
    }
}
