package com.tekpas.ai;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.ai.LlmGate.Decision;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** The gate opens only when all three hold: switched on, a key, a demo company (docs/m5-plan.md §3). */
class LlmGateTest {

    private static final UUID DEMO = UUID.randomUUID();
    private static final UUID REAL = UUID.randomUUID();
    private final AtomicInteger lookups = new AtomicInteger();

    private LlmGate gate(boolean enabled, String key) {
        AiProperties properties = new AiProperties(new AiProperties.Llm(enabled, 50),
                new AiProperties.Gemini(key, "some-model", "https://example.invalid", Duration.ofSeconds(20), 1024));
        return new LlmGate(properties, companyId -> {
            lookups.incrementAndGet();
            return DEMO.equals(companyId);
        });
    }

    @Test
    void opensOnlyWithTheSwitchAKeyAndADemoCompany() {
        assertThat(gate(true, "test-key-not-a-secret").check(DEMO)).isEqualTo(Decision.OPEN);
        assertThat(gate(true, "test-key-not-a-secret").opensFor(DEMO)).isTrue();
    }

    @Test
    void aRealCompanyNeverPasses() {
        assertThat(gate(true, "test-key-not-a-secret").check(REAL)).isEqualTo(Decision.NOT_DEMO);
    }

    @Test
    void offByDefaultAndWithoutAKeyTheCompanyIsNotEvenLookedUp() {
        assertThat(gate(false, "test-key-not-a-secret").check(DEMO)).isEqualTo(Decision.DISABLED);
        assertThat(gate(true, null).check(DEMO)).isEqualTo(Decision.NO_KEY);
        assertThat(gate(true, "   ").check(DEMO)).isEqualTo(Decision.NO_KEY);
        assertThat(lookups).hasValue(0);
    }

    @Test
    void theDefaultsKeepItClosed() {
        AiProperties defaults = new AiProperties(new AiProperties.Llm(false, 0),
                new AiProperties.Gemini(null, null, "https://example.invalid", Duration.ofSeconds(20), 1024));
        assertThat(new LlmGate(defaults, id -> true).check(DEMO)).isEqualTo(Decision.DISABLED);
    }

    @Test
    void theKeyNeverShowsInTheConfigurationText() {
        AiProperties.Gemini gemini = new AiProperties.Gemini("test-key-not-a-secret", "m", "https://x.invalid",
                Duration.ofSeconds(1), 1);
        assertThat(gemini.toString()).doesNotContain("test-key-not-a-secret").contains("***");
    }
}
