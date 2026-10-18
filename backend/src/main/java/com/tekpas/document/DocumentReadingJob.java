package com.tekpas.document;

import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.storage.MissingObjectException;
import com.tekpas.document.reading.DocumentReader;
import com.tekpas.document.reading.ReadResult;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobFailedPermanently;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code AI_EXTRACT_DOCUMENT}: reads an uploaded document and stores the proposal on it (docs/m5-plan.md §3).
 * The file is fetched and read outside any transaction; the row is touched only in two short ones (start, result).
 * Idempotent: a document that was removed, or already read, is left alone.
 *
 * <p>The LLM step for what the rules cannot read (scans, images, unknown layouts) comes with T5, behind the LLM
 * gate; until then those stay UNREADABLE and a person types the values.
 */
@Component
class DocumentReadingJob implements JobHandler<ExtractDocument> {

    static final String EXTRACT_TIMEOUT = "EXTRACT_TIMEOUT";
    static final String EXTRACT_FAILED = "EXTRACT_FAILED";

    private record File(String key, String mimeType) {
    }

    private final DocumentRepository documents;
    private final FileStorage storage;
    private final DocumentReader reader;
    private final Clock clock;
    private final TransactionTemplate tx;

    DocumentReadingJob(DocumentRepository documents, FileStorage storage, DocumentReader reader, Clock clock,
            PlatformTransactionManager transactions) {
        this.documents = documents;
        this.storage = storage;
        this.reader = reader;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    @Override
    public JobType type() {
        return JobType.AI_EXTRACT_DOCUMENT;
    }

    @Override
    public Class<ExtractDocument> payloadType() {
        return ExtractDocument.class;
    }

    /** Fetching up to 10 MB (storage timeout 30 s) and reading at most 20 pages. */
    @Override
    public Duration timeout() {
        return Duration.ofSeconds(45);
    }

    @Override
    public void handle(ExtractDocument payload, JobContext context) {
        File file = tx.execute(status -> documents.findById(payload.documentId())
                .filter(Document::awaitsReading)
                .map(d -> {
                    d.startReading();
                    return new File(d.getFileKey(), d.getMimeType());
                }).orElse(null));
        if (file == null) {
            return;
        }
        byte[] bytes;
        try {
            bytes = storage.read(file.key());
        } catch (MissingObjectException e) {
            throw new JobFailedPermanently("The document's file is missing from the storage", e);
        }
        ReadResult result;
        try {
            result = reader.read(bytes, file.mimeType());
        } catch (IOException | RuntimeException e) {
            throw new JobFailedPermanently("The document could not be parsed: " + e.getClass().getSimpleName(), e);
        }
        tx.executeWithoutResult(status -> documents.findById(payload.documentId())
                .filter(Document::awaitsReading)
                .ifPresent(d -> d.recordReading(result.status(), result.method(), result.failureCode(),
                        result.extraction(), null, clock.instant())));
    }

    /** The panel shows "Okunamadı" with the reason as a technical detail; the values are typed by hand. */
    @Override
    public void onGiveUp(ExtractDocument payload, String reason) {
        String code = reason.startsWith("Timed out") ? EXTRACT_TIMEOUT : EXTRACT_FAILED;
        tx.executeWithoutResult(status -> documents.findById(payload.documentId())
                .filter(Document::awaitsReading)
                .ifPresent(d -> d.readingFailed(code, clock.instant())));
    }
}
