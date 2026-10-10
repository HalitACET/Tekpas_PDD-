package com.tekpas.request.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * A new link (design v0.4 46a). The token is in this answer only: the server keeps its SHA-256, so the link
 * cannot be shown again ("Yeni link oluştur" makes a new one). The web builds {@code {origin}/r#<token>}.
 *
 * @param code "Gönderim no", e.g. KP-R-7HQ2
 */
public record CreatedDataRequest(UUID id, String code, String token, Instant expiresAt) {
}
