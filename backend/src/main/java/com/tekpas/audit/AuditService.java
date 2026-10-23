package com.tekpas.audit;

import com.tekpas.audit.dto.AuditEntry;
import com.tekpas.audit.dto.AuditPage;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Reading the audit trail (M12 T4, docs/m12-plan.md §6), newest first, always of one company. A record's label is
 * read from the record as it is now (a renamed product shows its new name), and from the entry itself once the record
 * is gone.
 */
@Service
public class AuditService {

    static final int DEFAULT_SIZE = 25;
    static final int MAX_SIZE = 100;
    /** Days of the date filter are Turkish days, as everywhere in the panel. */
    static final ZoneId ZONE = ZoneId.of("Europe/Istanbul");

    private static final String SELECT = """
            SELECT a.id, a.created_at, a.user_id, u.full_name, a.entity_type, a.entity_id, a.action, a.diff,
                   COALESCE(CASE a.entity_type
                       WHEN 'PRODUCT' THEN (SELECT p.name FROM product p WHERE p.id = a.entity_id)
                       WHEN 'BATCH' THEN (SELECT b.batch_no FROM batch b WHERE b.id = a.entity_id)
                       WHEN 'PASSPORT' THEN (SELECT b.batch_no FROM passport x JOIN batch b ON b.id = x.batch_id
                                             WHERE x.id = a.entity_id)
                       WHEN 'STEP' THEN (SELECT b.batch_no FROM supply_step s JOIN batch b ON b.id = s.batch_id
                                         WHERE s.id = a.entity_id)
                       WHEN 'DOCUMENT' THEN (SELECT COALESCE(c.name, d.original_name) FROM document d
                                             LEFT JOIN supply_step s ON s.id = d.step_id
                                             LEFT JOIN company c ON c.id = s.supplier_company_id
                                             WHERE d.id = a.entity_id)
                       WHEN 'TRANSLATION' THEN (SELECT b.batch_no FROM batch b WHERE b.id = a.entity_id)
                       WHEN 'ISSUE' THEN (SELECT b.batch_no FROM validation_issue i JOIN batch b ON b.id = i.batch_id
                                          WHERE i.id = a.entity_id)
                       WHEN 'SUPPLIER' THEN (SELECT c.name FROM company c WHERE c.id = a.entity_id)
                       WHEN 'USER' THEN (SELECT v.full_name FROM app_user v WHERE v.id = a.entity_id)
                       WHEN 'IMPORT' THEN (SELECT j.file_name FROM import_job j WHERE j.id = a.entity_id)
                   END, a.diff->>'label') AS label,
                   CASE a.entity_type
                       WHEN 'BATCH' THEN (SELECT b.id FROM batch b WHERE b.id = a.entity_id)
                       WHEN 'TRANSLATION' THEN (SELECT b.id FROM batch b WHERE b.id = a.entity_id)
                       WHEN 'PASSPORT' THEN (SELECT x.batch_id FROM passport x WHERE x.id = a.entity_id)
                       WHEN 'STEP' THEN (SELECT s.batch_id FROM supply_step s WHERE s.id = a.entity_id)
                       WHEN 'DOCUMENT' THEN (SELECT s.batch_id FROM document d JOIN supply_step s ON s.id = d.step_id
                                             WHERE d.id = a.entity_id)
                       WHEN 'ISSUE' THEN (SELECT i.batch_id FROM validation_issue i WHERE i.id = a.entity_id)
                   END AS batch_id
            FROM audit_log a LEFT JOIN app_user u ON u.id = a.user_id
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AuditService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /**
     * @param entityTypes any of these (none: all)
     * @param batchId     a batch's history: its own entries and those of its steps, documents, alerts, passports and
     *                    translations
     * @param page        0-based
     */
    @Transactional(readOnly = true)
    public AuditPage list(UUID companyId, @Nullable List<String> entityTypes, @Nullable UUID userId,
            @Nullable LocalDate from, @Nullable LocalDate to, @Nullable UUID batchId, @Nullable Integer page,
            @Nullable Integer size) {
        int limit = Math.clamp(size == null ? DEFAULT_SIZE : size, 1, MAX_SIZE);
        int pageNo = Math.max(0, page == null ? 0 : page);
        StringBuilder where = new StringBuilder(" WHERE a.company_id = ?");
        List<Object> args = new ArrayList<>(List.of(companyId));
        if (entityTypes != null && !entityTypes.isEmpty()) {
            where.append(" AND a.entity_type IN (").append(String.join(", ", entityTypes.stream().map(t -> "?")
                    .toList())).append(")");
            args.addAll(entityTypes);
        }
        if (userId != null) {
            where.append(" AND a.user_id = ?");
            args.add(userId);
        }
        if (from != null) {
            where.append(" AND a.created_at >= ?");
            args.add(Timestamp.from(from.atStartOfDay(ZONE).toInstant()));
        }
        if (to != null) {
            where.append(" AND a.created_at < ?");
            args.add(Timestamp.from(to.plusDays(1).atStartOfDay(ZONE).toInstant()));
        }
        // The batch id is worked out per row, so the batch filter goes around the query.
        String filtered = "SELECT * FROM (" + SELECT + where + ") t" + (batchId != null ? " WHERE t.batch_id = ?" : "");
        if (batchId != null) {
            args.add(batchId);
        }
        Long total = jdbc.queryForObject("SELECT count(*) FROM (" + filtered + ") c", Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(limit);
        pageArgs.add((long) pageNo * limit);
        List<AuditEntry> rows = jdbc.query(filtered + " ORDER BY t.id DESC LIMIT ? OFFSET ?", (rs, i) -> new AuditEntry(
                rs.getLong("id"),
                rs.getTimestamp("created_at").toInstant(), rs.getObject("user_id", UUID.class),
                rs.getString("full_name"), rs.getString("entity_type"), rs.getObject("entity_id", UUID.class),
                rs.getString("action"), rs.getString("label"), rs.getObject("batch_id", UUID.class),
                details(rs.getString("diff"))), pageArgs.toArray());
        return new AuditPage(rows, total == null ? 0 : total, pageNo, limit);
    }

    /** The entry's diff without its label, which is already the entry's {@code label}. */
    private Map<String, Object> details(@Nullable String diff) {
        if (diff == null) {
            return Map.of();
        }
        Map<String, Object> details = new LinkedHashMap<>(json.readValue(diff,
                new TypeReference<Map<String, Object>>() { }));
        details.remove("label");
        details.values().removeIf(v -> v == null);
        return details;
    }
}
