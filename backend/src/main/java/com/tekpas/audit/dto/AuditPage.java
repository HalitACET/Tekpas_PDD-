package com.tekpas.audit.dto;

import java.util.List;

/**
 * One page of the audit trail (design v1.2 180: "1–25 / 1.248 kayıt").
 *
 * @param total entries matching the filters, all pages together
 * @param page  0-based
 */
public record AuditPage(List<AuditEntry> entries, long total, int page, int size) {

    public AuditPage {
        entries = List.copyOf(entries);
    }
}
