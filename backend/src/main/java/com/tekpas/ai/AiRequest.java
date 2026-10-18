package com.tekpas.ai;

import java.util.List;
import java.util.Map;

/**
 * One call to the LLM: a fixed instruction of ours, the untrusted document (as text or as the file itself) and the
 * JSON schema the answer must follow. There are no tools and no function calling: the model can only answer.
 *
 * @param instruction ours alone; sent as the system instruction, never mixed with document content
 * @param document the untrusted parts, sent as the user's turn
 * @param responseSchema the answer's shape (Gemini's OpenAPI subset)
 */
public record AiRequest(String instruction, List<Part> document, Map<String, Object> responseSchema) {

    public AiRequest {
        document = List.copyOf(document);
        responseSchema = Map.copyOf(responseSchema);
    }

    public sealed interface Part permits Text, File {
    }

    public record Text(String text) implements Part {
    }

    /** The document itself (a scanned PDF, a photo), sent inline. */
    public record File(String mimeType, byte[] data) implements Part {
    }
}
