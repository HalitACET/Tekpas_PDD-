package com.tekpas.ai;

/**
 * An LLM provider behind one method (CLAUDE.md: Gemini behind {@code AiClient}). Callers never reach it directly
 * for a company's document: {@link LlmGate} decides first. Implementations: {@link GeminiAiClient} (REST, no SDK)
 * and {@link DisabledAiClient}; tests use a fake that records its calls.
 */
public interface AiClient {

    /** The model that answers, stored with the reading ({@code document.extraction_model}). */
    String model();

    /**
     * The model's answer to {@code request}, as the JSON text the schema asks for. The text is untrusted: the caller
     * parses and checks every value.
     *
     * @throws AiException when there is no usable answer
     */
    String generateJson(AiRequest request);
}
