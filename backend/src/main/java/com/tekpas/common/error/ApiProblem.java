package com.tekpas.common.error;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * OpenAPI schema of every error response (RFC 7807). Documentation only: the handlers write Spring's
 * {@code ProblemDetail}, whose JSON has exactly this shape. The generated client gets its error type from here.
 */
@Schema(name = "ApiProblem", description = "RFC 7807 problem detail")
public record ApiProblem(
        @Schema(example = "urn:tekpas:problem:validation") String type,
        @Schema(example = "Validation failed") String title,
        @Schema(example = "400") int status,
        @Nullable String detail,
        @Nullable String instance,
        @Schema(description = "Only for type urn:tekpas:problem:validation") @Nullable List<FieldViolation> errors) {
}
