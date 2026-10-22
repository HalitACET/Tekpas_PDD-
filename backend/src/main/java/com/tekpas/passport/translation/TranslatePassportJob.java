package com.tekpas.passport.translation;

import com.tekpas.ai.AiException;
import com.tekpas.ai.AiProperties;
import com.tekpas.ai.LlmBudget;
import com.tekpas.ai.LlmGate;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import com.tekpas.passport.translation.PassportTranslations.Loaded;
import com.tekpas.passport.translation.PassportTranslations.Payload;
import com.tekpas.passport.translation.PassportTranslator.Suggestion;
import com.tekpas.passport.translation.PassportTranslator.Wanted;
import com.tekpas.passport.translation.TranslationStore.Source;
import com.tekpas.passport.translation.TranslationStore.Stored;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code AI_TRANSLATE_PASSPORT}: one LLM call for the batch's texts that have neither an approved nor a hand-written
 * translation for their current wording (docs/m11-plan.md §3). The suggestions are written unapproved; a person
 * approves them (rule 5). Behind the gate (rule 4) and the daily budget; idempotent: a second run finds nothing left.
 */
@Component
class TranslatePassportJob implements JobHandler<Payload> {

    private static final Logger log = LoggerFactory.getLogger(TranslatePassportJob.class);
    private static final Duration BASE_TIMEOUT = Duration.ofSeconds(30);

    private final PassportTranslations translations;
    private final PassportTranslator translator;
    private final TranslationStore store;
    private final LlmGate gate;
    private final LlmBudget budget;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final Duration timeout;

    TranslatePassportJob(PassportTranslations translations, PassportTranslator translator, TranslationStore store,
            LlmGate gate, LlmBudget budget, PlatformTransactionManager transactions, Clock clock, AiProperties ai) {
        this.translations = translations;
        this.translator = translator;
        this.store = store;
        this.gate = gate;
        this.budget = budget;
        this.tx = new TransactionTemplate(transactions);
        this.clock = clock;
        this.timeout = BASE_TIMEOUT.plus(ai.gemini().timeout());
    }

    @Override
    public JobType type() {
        return JobType.AI_TRANSLATE_PASSPORT;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        return timeout;
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        if (!gate.opensFor(payload.companyId())) {
            return;
        }
        Loaded loaded = tx.execute(status -> translations.loadForJob(payload.companyId(), payload.batchId()));
        if (loaded == null) {
            return;
        }
        List<Wanted> wanted = wanted(loaded);
        if (wanted.isEmpty()) {
            return;
        }
        if (!budget.tryAcquire()) {
            log.warn("LLM daily limit reached, the translations of batch {} are not suggested", payload.batchId());
            return;
        }
        List<Suggestion> suggestions;
        try {
            suggestions = translator.translate(wanted);
        } catch (AiException e) {
            if (e.retryable() && !context.lastAttempt()) {
                throw e;
            }
            log.warn("Translations of batch {} gave up: {}", payload.batchId(), e.getMessage());
            return;
        }
        Map<String, TranslatableText> texts = new HashMap<>();
        wanted.forEach(w -> texts.put(w.text().field(), w.text()));
        tx.executeWithoutResult(status -> {
            for (Suggestion s : suggestions) {
                store.suggest(payload.companyId(), payload.batchId(), s.field(), s.language(), s.text(),
                        texts.get(s.field()).hash(), clock.instant());
            }
        });
        log.info("Translations of batch {}: {} suggested", payload.batchId(), suggestions.size());
    }

    /**
     * What to ask for: per text, the languages without an approved translation or a hand-written one of its current
     * wording. Those stay as they are; an AI suggestion that was never approved is asked again (its text may be stale).
     */
    static List<Wanted> wanted(Loaded loaded) {
        Map<String, Stored> byKey = loaded.byKey();
        List<Wanted> wanted = new ArrayList<>();
        for (TranslatableText text : loaded.texts()) {
            List<String> languages = text.targets().stream().filter(language -> {
                Stored s = byKey.get(text.field() + "/" + language);
                return s == null || !(s.approvedFor(text) || (s.source() == Source.MANUAL && s.freshFor(text)));
            }).toList();
            if (!languages.isEmpty()) {
                wanted.add(new Wanted(text, languages));
            }
        }
        return wanted;
    }
}
