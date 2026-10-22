package com.tekpas.passport.translation;

import com.tekpas.ai.LlmBudget;
import com.tekpas.ai.LlmGate;
import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import com.tekpas.passport.snapshot.SnapshotTranslation;
import com.tekpas.passport.translation.TranslationStore.Source;
import com.tekpas.passport.translation.TranslationStore.Stored;
import com.tekpas.passport.translation.dto.TranslationEntry;
import com.tekpas.passport.translation.dto.TranslationField;
import com.tekpas.passport.translation.dto.TranslationsResponse;
import com.tekpas.passport.translation.dto.TranslationsUpdateRequest;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Translations of a batch's free texts, prepared and approved before publishing (docs/m11-plan.md §3). An AI
 * suggestion is only asked for a demo company (rule 4) and is written unapproved (rule 5); an approval holds for the
 * source text it was given for, so a text changed afterwards needs a new one. Every lookup is filtered by the company;
 * another company's batch is a 404.
 */
@Service
public class PassportTranslations {

    /** Chain order, as on the passport (PassportSnapshotBuilder). */
    private static final Comparator<SupplyStep> CHAIN_ORDER = Comparator.comparing(SupplyStep::getStepType)
            .thenComparingInt(SupplyStep::getSortOrder).thenComparing(SupplyStep::getCreatedAt)
            .thenComparing(SupplyStep::getId);

    /** Today's LLM calls are used up: a 409 of suggest, and how a queued suggestion can end. */
    public static final String LIMIT_REACHED = "AI_LIMIT_REACHED";
    /** The LLM did not answer usably; nothing was changed. */
    public static final String SUGGESTION_FAILED = "SUGGESTION_FAILED";

    /** What the suggestion job carries. */
    public record Payload(UUID companyId, UUID batchId) {
    }

    /** The batch's texts and their stored translations, loaded together. */
    record Loaded(List<TranslatableText> texts, List<Stored> stored) {

        Map<String, Stored> byKey() {
            Map<String, Stored> map = new HashMap<>();
            stored.forEach(s -> map.put(s.field() + "/" + s.language(), s));
            return map;
        }
    }

    private final BatchRepository batches;
    private final ProductRepository products;
    private final SupplyStepRepository steps;
    private final TranslationStore store;
    private final LlmGate gate;
    private final LlmBudget budget;
    private final JobQueue queue;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public PassportTranslations(BatchRepository batches, ProductRepository products, SupplyStepRepository steps,
            TranslationStore store, LlmGate gate, LlmBudget budget, JobQueue queue, JdbcTemplate jdbc, Clock clock) {
        this.batches = batches;
        this.products = products;
        this.steps = steps;
        this.store = store;
        this.gate = gate;
        this.budget = budget;
        this.queue = queue;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TranslationsResponse get(UUID companyId, UUID batchId) {
        Loaded loaded = load(companyId, batchId);
        Map<String, Stored> byKey = loaded.byKey();
        List<TranslationField> fields = loaded.texts().stream().map(text -> new TranslationField(text.field(),
                text.kind(), text.stepType(), text.text(), text.language(), text.targets().stream().map(language -> {
                    Stored s = byKey.get(text.field() + "/" + language);
                    return s == null ? new TranslationEntry(language, null, false, false, false, null, null)
                            : new TranslationEntry(language, s.text(), s.source() == Source.AI, s.approvedFor(text),
                                    !s.freshFor(text), s.approvedFor(text) ? s.approvedAt() : null,
                                    s.approvedFor(text) ? s.approvedByName() : null);
                }).toList())).toList();
        Suggestion last = lastSuggestion(batchId);
        return new TranslationsResponse(gate.opensFor(companyId), last.running(), last.failure(), fields);
    }

    /** Queues one AI suggestion for the texts without an approved or hand-written translation. */
    @Transactional
    public TranslationsResponse suggest(UUID companyId, UUID batchId) {
        Loaded loaded = load(companyId, batchId);
        if (!gate.opensFor(companyId)) {
            throw ConflictException.state("AI_NOT_AVAILABLE",
                    "Translations are suggested only for demo companies; write them yourself");
        }
        if (loaded.texts().isEmpty()) {
            throw ConflictException.state("NOTHING_TO_TRANSLATE", "The batch's passport has no free text to translate");
        }
        if (budget.exhausted()) {
            throw ConflictException.state(LIMIT_REACHED, "Today's AI limit is reached; suggest again tomorrow");
        }
        queue.enqueueUnlessQueued(JobType.AI_TRANSLATE_PASSPORT, new Payload(companyId, batchId));
        TranslationsResponse now = get(companyId, batchId);
        return new TranslationsResponse(now.aiAvailable(), true, null, now.fields());
    }

    @Transactional
    public TranslationsResponse save(UUID companyId, UUID userId, UUID batchId, TranslationsUpdateRequest request) {
        Loaded loaded = load(companyId, batchId);
        Map<String, TranslatableText> texts = new HashMap<>();
        loaded.texts().forEach(t -> texts.put(t.field(), t));
        Map<String, Stored> byKey = loaded.byKey();
        List<FieldViolation> errors = new ArrayList<>();
        for (int i = 0; i < request.entries().size(); i++) {
            TranslationsUpdateRequest.Entry e = request.entries().get(i);
            TranslatableText text = texts.get(e.field());
            if (text == null) {
                errors.add(new FieldViolation("entries[" + i + "].field", "TranslationField", "No such text"));
            } else if (!text.targets().contains(e.language())) {
                errors.add(new FieldViolation("entries[" + i + "].language", "TranslationLanguage",
                        "The text is written in this language"));
            } else if (e.approved() && (e.text() == null || e.text().isBlank())) {
                errors.add(new FieldViolation("entries[" + i + "].text", "NotBlank", "An approved translation has a text"));
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidFieldsException(errors.toArray(FieldViolation[]::new));
        }
        for (TranslationsUpdateRequest.Entry e : request.entries()) {
            TranslatableText text = texts.get(e.field());
            if (e.text() == null || e.text().isBlank()) {
                store.delete(companyId, batchId, e.field(), e.language());
                continue;
            }
            String value = e.text().strip();
            Stored before = byKey.get(e.field() + "/" + e.language());
            // An AI text stays the AI's until someone changes it.
            Source source = before != null && before.source() == Source.AI && before.text().equals(value) ? Source.AI
                    : Source.MANUAL;
            store.upsert(companyId, batchId, e.field(), e.language(), value, source, text.hash(),
                    e.approved() ? userId : null, clock.instant());
        }
        return get(companyId, batchId);
    }

    /**
     * What the passport freezes (schemaVersion 3): approved translations of the texts as they are now, the steps'
     * only for approved steps (their data is in the passport), keyed like the snapshot ({@code s3.fabricType}).
     */
    public List<SnapshotTranslation> approvedFor(UUID companyId, UUID batchId, Product product,
            List<SupplyStep> chainInOrder, Map<UUID, String> stepKeys) {
        Map<UUID, SupplyStep> byId = new HashMap<>();
        chainInOrder.forEach(s -> byId.put(s.getId(), s));
        Map<String, TranslatableText> texts = new HashMap<>();
        TranslatableText.of(product, chainInOrder).forEach(t -> texts.put(t.field(), t));
        List<Stored> stored = store.of(companyId, batchId);
        List<SnapshotTranslation> out = new ArrayList<>();
        for (Stored s : stored) {
            TranslatableText text = texts.get(s.field());
            if (text == null || !s.approvedFor(text)) {
                continue;
            }
            String path = s.field();
            if (text.stepId() != null) {
                SupplyStep step = byId.get(text.stepId());
                if (step == null || step.getStatus() != StepStatus.APPROVED) {
                    continue;
                }
                path = stepKeys.get(text.stepId()) + "." + s.field().substring(s.field().lastIndexOf('.') + 1);
            }
            out.add(new SnapshotTranslation(path, s.language(), s.text(), s.source() == Source.AI));
        }
        out.sort(Comparator.comparing(SnapshotTranslation::field).thenComparing(SnapshotTranslation::language));
        return out;
    }

    /** The texts and the stored rows, for the job. Null when the batch is gone. */
    @Nullable Loaded loadForJob(UUID companyId, UUID batchId) {
        return batches.findByIdAndCompanyId(batchId, companyId).map(batch -> loaded(companyId, batch)).orElse(null);
    }

    private Loaded load(UUID companyId, UUID batchId) {
        Batch batch = batches.findByIdAndCompanyId(batchId, companyId)
                .orElseThrow(() -> new NotFoundException("Batch not found"));
        return loaded(companyId, batch);
    }

    private Loaded loaded(UUID companyId, Batch batch) {
        Product product = products.findByIdAndCompanyId(batch.getProductId(), companyId).orElseThrow();
        List<SupplyStep> chain = steps.findByBatchIdIn(List.of(batch.getId())).stream().sorted(CHAIN_ORDER).toList();
        return new Loaded(TranslatableText.of(product, chain), store.of(companyId, batch.getId()));
    }

    /** Where the batch's latest suggestion stands: running, or how it failed (null when it worked or never ran). */
    private record Suggestion(boolean running, @Nullable String failure) {
    }

    private Suggestion lastSuggestion(UUID batchId) {
        return jdbc.query("""
                SELECT status, last_error FROM job WHERE type = 'AI_TRANSLATE_PASSPORT' AND payload->>'batchId' = ?
                ORDER BY id DESC LIMIT 1
                """, rs -> {
            if (!rs.next()) {
                return new Suggestion(false, null);
            }
            return switch (rs.getString("status")) {
                case "QUEUED", "RUNNING" -> new Suggestion(true, null);
                case "FAILED", "DEAD" -> new Suggestion(false,
                        LIMIT_REACHED.equals(rs.getString("last_error")) ? LIMIT_REACHED : SUGGESTION_FAILED);
                default -> new Suggestion(false, null);
            };
        }, batchId.toString());
    }
}
