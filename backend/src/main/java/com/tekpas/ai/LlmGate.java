package com.tekpas.ai;

import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The one place that decides whether a company's document may go to the LLM (docs/m5-plan.md §3). It opens only
 * when all three hold: the LLM is switched on ({@code LLM_ENABLED}, off by default), a key is set, and the company
 * is a demo company ({@code company.is_demo}, set only for the seeded ones). A real supplier's document therefore
 * never reaches a free tier that may use it. Nothing else may call {@link AiClient} with a company's document.
 */
@Component
public class LlmGate {

    public enum Decision { OPEN, DISABLED, NO_KEY, NOT_DEMO }

    private final AiProperties properties;
    private final Predicate<UUID> isDemo;

    @Autowired
    public LlmGate(AiProperties properties, JdbcTemplate jdbc) {
        this(properties, companyId -> {
            List<Boolean> demo = jdbc.queryForList("SELECT is_demo FROM company WHERE id = ?", Boolean.class,
                    companyId);
            return demo.size() == 1 && Boolean.TRUE.equals(demo.getFirst());
        });
    }

    LlmGate(AiProperties properties, Predicate<UUID> isDemo) {
        this.properties = properties;
        this.isDemo = isDemo;
    }

    /** The switch and the key are checked first; the company is looked up only when both are there. */
    public Decision check(UUID companyId) {
        if (!properties.llm().enabled()) {
            return Decision.DISABLED;
        }
        if (!properties.gemini().hasKey()) {
            return Decision.NO_KEY;
        }
        return isDemo.test(companyId) ? Decision.OPEN : Decision.NOT_DEMO;
    }

    public boolean opensFor(UUID companyId) {
        return check(companyId) == Decision.OPEN;
    }
}
