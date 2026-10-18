package com.tekpas.ai;

import java.net.URI;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

/**
 * The LLM provider: Gemini when the LLM is switched on and a key is set, otherwise none. Switched on with a key
 * but without a usable model or URL, startup stops (a half-configured LLM fails now, not at the first scan).
 * Messages name the variable, never its value.
 */
@Configuration
public class AiConfig {

    private static final Logger log = LoggerFactory.getLogger(AiConfig.class);
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "[::1]");

    @Bean
    AiClient aiClient(AiProperties properties, ObjectMapper json) {
        AiProperties.Gemini gemini = properties.gemini();
        if (!properties.llm().enabled()) {
            return new DisabledAiClient();
        }
        if (!gemini.hasKey()) {
            log.warn("LLM_ENABLED is true but GEMINI_API_KEY is empty: the LLM gate stays closed");
            return new DisabledAiClient();
        }
        if (gemini.model() == null || gemini.model().isBlank()) {
            throw new IllegalStateException("GEMINI_MODEL is required when LLM_ENABLED=true");
        }
        if (properties.llm().dailyLimit() <= 0) {
            log.warn("LLM_DAILY_LIMIT is 0: the LLM gate is open but no call will be made");
        }
        requireSecureUrl(gemini.baseUrl());
        GeminiAiClient client = new GeminiAiClient(gemini.baseUrl(), gemini.apiKey(), gemini.model(),
                gemini.timeout(), gemini.maxOutputTokens(), json);
        log.warn("LLM reading is ON (model {}, at most {} calls a day): only documents of demo companies are sent. "
                + "On Google's free tier the content may be used by Google; send synthetic documents only.",
                client.model(), properties.llm().dailyLimit());
        return client;
    }

    /** The key travels over TLS only, except to a loopback test server. */
    private static void requireSecureUrl(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("tekpas.ai.gemini.base-url is not a valid URL");
        }
        boolean https = "https".equalsIgnoreCase(uri.getScheme());
        boolean loopback = "http".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                && LOOPBACK.contains(uri.getHost().toLowerCase(Locale.ROOT));
        if (!(https || loopback) || uri.getHost() == null) {
            throw new IllegalStateException("tekpas.ai.gemini.base-url must be an https:// URL");
        }
    }
}
