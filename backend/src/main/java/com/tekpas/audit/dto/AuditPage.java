package com.tekpas.audit.dto;

import java.util.List;
import org.jspecify.annotations.Nullable;

/** @param nextBefore pass as {@code before} for the next (older) page; null on the last page */
public record AuditPage(List<AuditEntry> entries, @Nullable Long nextBefore) {

    public AuditPage {
        entries = List.copyOf(entries);
    }
}
