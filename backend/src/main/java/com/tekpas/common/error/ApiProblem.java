package com.tekpas.common.error;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * OpenAPI schema of every error response (RFC 7807). Documentation only: the handlers write Spring's
 * {@code ProblemDetail}, whose JSON has exactly this shape. The generated client gets its error type from here.
 */
@Schema(name = "ApiProblem", description = "RFC 7807 problem detail")
public record ApiProblem(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, example = "urn:tekpas:problem:validation") String type,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, example = "Validation failed") String title,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, example = "400") int status,
        String detail,
        String instance,
        @Schema(description = "Only for type urn:tekpas:problem:validation") List<FieldViolation> errors) {
}
