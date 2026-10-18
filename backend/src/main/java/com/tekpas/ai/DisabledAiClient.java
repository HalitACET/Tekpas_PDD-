package com.tekpas.ai;

/** No key or LLM off: there is no provider. {@link LlmGate} stays closed, so this is never called in practice. */
final class DisabledAiClient implements AiClient {

    @Override
    public String model() {
        return "none";
    }

    @Override
    public String generateJson(AiRequest request) {
        throw new AiException(AiException.Kind.REJECTED, "LLM is not configured");
    }
}
