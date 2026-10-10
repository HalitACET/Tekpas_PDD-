package com.tekpas.supplychain.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * The last data a supplier sent through a link (design v0.4 47a "Selin A. · 17 Eyl 2026 15:40").
 *
 * @param name and {@code role}: what the supplier typed in the form ("Gönderen")
 * @param code "Gönderim no"
 */
public record StepSubmission(String name, @Nullable String role, Instant at, String code) {
}
