package com.tekpas.document;

import com.tekpas.ai.AiException;
import com.tekpas.ai.AiProperties;
import com.tekpas.ai.LlmBudget;
import com.tekpas.ai.LlmGate;
import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.storage.MissingObjectException;
import com.tekpas.document.reading.DocumentReader;
import com.tekpas.document.reading.LlmDocumentReader;
import com.tekpas.document.reading.ReadResult;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobFailedPermanently;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code AI_EXTRACT_DOCUMENT}: reads an uploaded document and stores the proposal on it (docs/m5-plan.md §3).
 * The file is fetched and read outside any transaction; the row is touched only in two short ones (start, result).
 * Idempotent: a document that was removed, or already read, is left alone.
 *
 * <p>What the rules leave UNREADABLE (scans, photos, unknown layouts) goes to the LLM only when the {@link LlmGate}
 * opens for the document's company and today's {@link LlmBudget} allows a call. A quota answer (429), a refusal or
 * the daily cap falls back to manual entry at once (UNREADABLE, {@code LLM_UNAVAILABLE}); a timeout or a server
 * error is retried with the job's own retries and falls back to manual entry on the last attempt. Either way the
 * job ends DONE: the document is not broken, a person types the values.
 */
@Component
class DocumentReadingJob implements JobHandler<ExtractDocument> {

    static final String EXTRACT_TIMEOUT = "EXTRACT_TIMEOUT";
    static final String EXTRACT_FAILED = "EXTRACT_FAILED";

    private static final Logger log = LoggerFactory.getLogger(DocumentReadingJob.class);
    /** Fetching up to 10 MB (storage timeout 30 s) and reading at most 20 pages; an LLM call adds its own. */
    private static final Duration BASE_TIMEOUT = Duration.ofSeconds(45);

    private record File(UUID companyId, String key, String mimeType) {
    }

    private final DocumentRepository documents;
    private final FileStorage storage;
    private final DocumentReader reader;
    private final LlmDocumentReader llmReader;
    private final LlmGate gate;
    private final LlmBudget budget;
    private final Duration timeout;
    private final Clock clock;
    private final TransactionTemplate tx;

    DocumentReadingJob(DocumentRepository documents, FileStorage storage, DocumentReader reader,
            LlmDocumentReader llmReader, LlmGate gate, LlmBudget budget, AiProperties ai, Clock clock,
            PlatformTransactionManager transactions) {
        this.documents = documents;
        this.storage = storage;
        this.reader = reader;
        this.llmReader = llmReader;
        this.gate = gate;
        this.budget = budget;
        this.timeout = BASE_TIMEOUT.plus(ai.gemini().timeout());
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

    @Override
    public Duration timeout() {
        return timeout;
    }

    @Override
    public void handle(ExtractDocument payload, JobContext context) {
        File file = tx.execute(status -> documents.findById(payload.documentId())
                .filter(Document::awaitsReading)
                .map(d -> {
                    d.startReading();
                    return new File(d.getCompanyId(), d.getFileKey(), d.getMimeType());
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
        ReadResult byRules;
        try {
            byRules = reader.read(bytes, file.mimeType());
        } catch (IOException | RuntimeException e) {
            throw new JobFailedPermanently("The document could not be parsed: " + e.getClass().getSimpleName(), e);
        }
        ReadResult result = byRules.status() == ExtractionStatus.UNREADABLE
                ? byLlm(payload.documentId(), file, bytes, byRules, context)
                : byRules;
        @Nullable String model = result.method() == ExtractionMethod.LLM ? llmReader.model() : null;
        tx.executeWithoutResult(status -> documents.findById(payload.documentId())
                .filter(Document::awaitsReading)
                .ifPresent(d -> d.recordReading(result.status(), result.method(), result.failureCode(),
                        result.extraction(), model, clock.instant())));
    }

    /** The LLM's reading where the gate and the budget allow it; otherwise the rules' result stands. */
    private ReadResult byLlm(UUID documentId, File file, byte[] bytes, ReadResult byRules, JobContext context) {
        if (!gate.opensFor(file.companyId())) {
            return byRules;
        }
        if (!budget.tryAcquire()) {
            log.warn("LLM daily limit reached, document {} is left for manual entry", documentId);
            return byRules.unreadable(ReadResult.LLM_UNAVAILABLE);
        }
        try {
            return llmReader.read(bytes, file.mimeType(), byRules);
        } catch (AiException e) {
            if (e.retryable() && !context.lastAttempt()) {
                throw e;
            }
            log.warn("LLM reading of document {} gave up, left for manual entry: {}", documentId, e.getMessage());
            return byRules.unreadable(e.kind() == AiException.Kind.NO_ANSWER
                    ? ReadResult.LLM_NO_RESULT : ReadResult.LLM_UNAVAILABLE);
        } catch (IOException | RuntimeException e) {
            log.warn("LLM reading of document {} failed, left for manual entry: {}", documentId,
                    e.getClass().getSimpleName());
            return byRules.unreadable(ReadResult.LLM_NO_RESULT);
        }
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
