package com.tekpas.ai;

import java.time.Duration;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code LLM_ENABLED}, {@code LLM_DAILY_LIMIT}, {@code GEMINI_API_KEY}, {@code GEMINI_MODEL}, {@code GEMINI_TIMEOUT},
 * {@code GEMINI_MAX_OUTPUT_TOKENS}. Off unless switched on: nothing is sent anywhere by default. The model name and
 * the limits are configuration, never code: Google's model list and free-tier quotas change (check AI Studio on the
 * day of a demo, docs/m5-plan.md §8).
 */
@ConfigurationProperties("tekpas.ai")
public record AiProperties(@DefaultValue Llm llm, @DefaultValue Gemini gemini) {

    /**
     * @param enabled the first of the three conditions of {@link LlmGate}; false in production by default
     * @param dailyLimit our own cap on calls per day (Pacific time, when Google's daily quota resets); 0 = none
     */
    public record Llm(@DefaultValue("false") boolean enabled, @DefaultValue("0") int dailyLimit) {
    }

    /**
     * @param apiKey sent as the {@code x-goog-api-key} header only: never in a URL, a log line or a message
     * @param model the model id as AI Studio lists it (e.g. a Flash-Lite model)
     * @param timeout for one call; the reading job's own timeout grows by this much
     */
    public record Gemini(@Nullable String apiKey, @Nullable String model,
            @DefaultValue("https://generativelanguage.googleapis.com/v1beta") String baseUrl,
            @DefaultValue("PT20S") Duration timeout, @DefaultValue("1024") int maxOutputTokens) {

        public boolean hasKey() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "Gemini[apiKey=" + (hasKey() ? "***" : "") + ", model=" + model + ", baseUrl=" + baseUrl
                    + ", timeout=" + timeout + ", maxOutputTokens=" + maxOutputTokens + "]";
        }
    }
}
