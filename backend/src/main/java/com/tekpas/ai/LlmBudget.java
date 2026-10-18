package com.tekpas.ai;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Our own daily cap on LLM calls ({@code LLM_DAILY_LIMIT}), kept in the database (V10 {@code llm_usage}) so a
 * restart does not reset it. Every attempt counts, failed ones too. Days are Pacific time, when the provider's
 * daily quota resets.
 */
@Component
public class LlmBudget {

    static final ZoneId QUOTA_ZONE = ZoneId.of("America/Los_Angeles");

    private final JdbcTemplate jdbc;
    private final AiProperties properties;
    private final Clock clock;

    public LlmBudget(JdbcTemplate jdbc, AiProperties properties, Clock clock) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.clock = clock;
    }

    /** Counts one call if today's cap allows it, atomically (no two callers take the last one). */
    public boolean tryAcquire() {
        int limit = properties.llm().dailyLimit();
        if (limit <= 0) {
            return false;
        }
        LocalDate today = LocalDate.ofInstant(clock.instant(), QUOTA_ZONE);
        return !jdbc.queryForList("""
                INSERT INTO llm_usage (day, calls) VALUES (?, 1)
                ON CONFLICT (day) DO UPDATE SET calls = llm_usage.calls + 1 WHERE llm_usage.calls < ?
                RETURNING calls""", Integer.class, today, limit).isEmpty();
    }
}
