package com.tekpas.common.audit;

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

    public AuditLog(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
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
