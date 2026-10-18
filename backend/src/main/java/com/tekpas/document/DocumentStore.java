package com.tekpas.document;

import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.storage.StorageException;
import com.tekpas.document.FileInspector.InspectedFile;
import com.tekpas.common.error.ConflictException;
import com.tekpas.request.StepEventKind;
import com.tekpas.request.StepEvents;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Writes one accepted upload: the object first, then the row, with the object removed again if the row cannot be
 * written. The 10 MB transfer to the storage happens outside any transaction (a Hikari connection and a row
 * lock must not wait on a slow network), so the caller's rules run twice: once before the transfer and again,
 * under the locks, right before the row is inserted. A crash between the two steps leaves an unreferenced
 * object; the cleanup job (M5 T3) sweeps those.
 */
@Component
class DocumentStore {

    private static final Logger log = LoggerFactory.getLogger(DocumentStore.class);

    /** Where an upload lands, as decided by the caller's rules; must be equal on both runs. */
    record Target(UUID companyId, UUID stepId, @Nullable UUID requestId, @Nullable UUID uploadedBy,
            @Nullable String uploadedByName) {
    }

    private final FileStorage storage;
    private final DocumentRepository documents;
    private final StepEvents events;
    private final Clock clock;
    private final TransactionTemplate tx;

    DocumentStore(FileStorage storage, DocumentRepository documents, StepEvents events, Clock clock,
            PlatformTransactionManager transactions) {
        this.storage = storage;
        this.documents = documents;
        this.events = events;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    /**
     * @param rules locks what it needs, throws the API's conflicts (limit, duplicate, closed link) and returns the
     *        target; it runs in a transaction both times
     */
    Document save(InspectedFile file, DocType docType, Supplier<Target> rules) {
        Target planned = tx.execute(status -> rules.get());
        UUID id = UUID.randomUUID();
        String key = "docs/" + planned.companyId() + "/" + id;
        storage.put(key, file.bytes(), file.mimeType());
        try {
            return tx.execute(status -> {
                Target now = rules.get();
                if (!now.equals(planned)) {
                    throw ConflictException.state("DOCUMENT_TARGET_CHANGED", "The upload's target changed");
                }
                Document saved = documents.saveAndFlush(new Document(id, now.companyId(), now.stepId(),
                        now.requestId(), docType, key, file.displayName(), file.mimeType(), file.bytes().length,
                        file.sha256(), file.pageCount(), now.uploadedBy(), now.uploadedByName(), clock.instant()));
                events.record(now.stepId(), now.requestId(), StepEventKind.DOCUMENT_UPLOADED, now.uploadedBy(),
                        now.uploadedByName(), Map.of("documentId", id.toString(), "docType", docType.name(),
                                "source", saved.source().name()));
                return saved;
            });
        } catch (DataIntegrityViolationException e) {
            discard(key);
            throw ConflictException.state("DUPLICATE_DOCUMENT", "This file is already uploaded for the step");
        } catch (RuntimeException e) {
            discard(key);
            throw e;
        }
    }

    /** Best effort: a failed delete only leaves an object nothing refers to. */
    void discard(String key) {
        try {
            storage.delete(key);
        } catch (StorageException e) {
            log.warn("Could not remove an unreferenced storage object (docs/<company>/<document>): {}",
                    e.getMessage());
        }
    }
}
