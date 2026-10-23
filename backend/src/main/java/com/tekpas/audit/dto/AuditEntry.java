package com.tekpas.audit.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One entry of the audit trail (design brief v1.2 162).
 *
 * @param userName who did it; null for the system (a daily job) or a user that no longer exists
 * @param entityType PRODUCT, BATCH, PASSPORT, STEP, DOCUMENT, ISSUE, SUPPLIER, USER, IMPORT or TRANSLATION
 * @param action e.g. CREATE, UPDATE, DELETE, PUBLISH, WITHDRAW, APPROVE, REJECT, VERIFY, RESOLVE, INVITE, ROLE, IMPORT
 * @param label the record as people know it (batch number, product or file name; a document's supplier), also
 *     after it was deleted
 * @param batchId the batch the record belongs to, for a link
 * @param details what changed: field names, a role from and to, a version, counts; never a password or a text
 */
public record AuditEntry(long id, Instant at, @Nullable UUID userId, @Nullable String userName, String entityType,
        UUID entityId, String action, @Nullable String label, @Nullable UUID batchId, Map<String, Object> details) {

    public AuditEntry {
        details = Map.copyOf(details);
    }
}
