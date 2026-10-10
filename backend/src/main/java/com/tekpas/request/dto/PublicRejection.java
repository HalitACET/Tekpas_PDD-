package com.tekpas.request.dto;

import java.time.Instant;
import java.util.List;

/**
 * The correction the manufacturer asked for (design v0.4 45).
 *
 * @param fields step data fields to correct, marked on the form
 * @param byName who asked, e.g. "Elif Yılmaz"
 */
public record PublicRejection(String reason, List<String> fields, Instant at, String byName) {
}
