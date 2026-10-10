package com.tekpas.request.dto;

import java.time.Instant;

/** The confirmation (design v0.4 43). */
public record PublicSubmitResponse(String code, Instant submittedAt, String manufacturerName) {
}
