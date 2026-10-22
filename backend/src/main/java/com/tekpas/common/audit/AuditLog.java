package com.tekpas.common.audit;

import com.tekpas.common.security.CurrentUser;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * The audit trail (V1 {@code audit_log}, M12 T4, docs/m12-plan.md §6): who did what to which record. Written in the
 * caller's transaction, so a change that is rolled back leaves no entry. {@code diff} holds field names and short
 * values only: never a password, a token or a document's content.
 */
@Component
public class AuditLog {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final CurrentUser currentUser;

    public AuditLog(JdbcTemplate jdbc, ObjectMapper json, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.json = json;
        this.currentUser = currentUser;
    }

    /**
     * The usual {@code diff}: the record's label (shown even after it is deleted) and the names of the fields that
     * changed, if any. Values are left out: a description or a note does not belong in the trail.
     */
    public static Map<String, Object> details(String label, String... changedFields) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("label", label);
        if (changedFields.length > 0) {
            details.put("fields", List.of(changedFields));
        }
        return details;
    }

    /**
     * The names of a partial update's fields that were sent: pairs of (value, name), a null value is a field left out.
     */
    public static String[] changed(@Nullable Object... valueNamePairs) {
        List<String> names = new java.util.ArrayList<>();
        for (int i = 0; i + 1 < valueNamePairs.length; i += 2) {
            if (valueNamePairs[i] != null) {
                names.add((String) valueNamePairs[i + 1]);
            }
        }
        return names.toArray(String[]::new);
    }

    /**
     * By the user of the current request; outside a request (a job, the demo seeder) the entry is the system's.
     *
     * @param diff what changed and, for a record that may be deleted later, its {@code label} (e.g. the product's name)
     */
    public void record(UUID companyId, String entityType, UUID entityId, String action, @Nullable Map<String, ?> diff) {
        record(companyId, currentUser.userIdIfAny().orElse(null), entityType, entityId, action, diff);
    }

    /**
     * @param userId who did it; null for the system (a daily job)
     * @param diff   what changed, e.g. {@code {"role": ["EDITOR", "ADMIN"]}}; null when the action says it all
     */
    public void record(UUID companyId, @Nullable UUID userId, String entityType, UUID entityId, String action,
            @Nullable Map<String, ?> diff) {
        jdbc.update("""
                INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, diff)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb))
                """, companyId, userId, entityType, entityId, action,
                diff == null ? null : json.writeValueAsString(diff));
    }
}
