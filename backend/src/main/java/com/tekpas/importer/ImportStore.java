package com.tekpas.importer;

import com.tekpas.importer.ProductImport.RowError;
import com.tekpas.importer.dto.ImportResponse;
import com.tekpas.importer.dto.ImportRowError;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** {@code import_job} (V20); every statement is filtered by the company. */
@Component
class ImportStore {

    static final int MAX_STORED_ERRORS = 200;

    private static final String SELECT = """
            SELECT j.id, j.kind, j.file_name, j.status, j.total_rows, j.created_rows, j.failed_rows, j.errors,
                   j.failure_code, u.full_name, j.created_at, j.finished_at
            FROM import_job j LEFT JOIN app_user u ON u.id = j.created_by
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    ImportStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    void insert(UUID id, UUID companyId, String kind, String fileName, byte[] file, UUID createdBy) {
        jdbc.update("""
                INSERT INTO import_job (id, company_id, kind, file_name, file, created_by) VALUES (?, ?, ?, ?, ?, ?)
                """, id, companyId, kind, fileName, file, createdBy);
    }

    Optional<ImportResponse> get(UUID companyId, UUID id) {
        return jdbc.query(SELECT + " WHERE j.company_id = ? AND j.id = ?", (rs, i) -> row(rs, true), companyId, id)
                .stream().findFirst();
    }

    List<ImportResponse> list(UUID companyId, int limit) {
        return jdbc.query(SELECT + " WHERE j.company_id = ? ORDER BY j.created_at DESC, j.id LIMIT ?",
                (rs, i) -> row(rs, false), companyId, limit);
    }

    /** The file of a queued import, which becomes RUNNING; empty when it is not queued (already taken, or gone). */
    Optional<byte[]> start(UUID companyId, UUID id) {
        return jdbc.query("""
                UPDATE import_job SET status = 'RUNNING' WHERE company_id = ? AND id = ? AND status = 'QUEUED'
                RETURNING file
                """, (rs, i) -> rs.getBytes("file"), companyId, id).stream().findFirst();
    }

    void done(UUID companyId, UUID id, int total, int created, int failed, List<RowError> errors, Instant now) {
        List<ImportRowError> kept = errors.stream().limit(MAX_STORED_ERRORS)
                .map(e -> new ImportRowError(e.row(), e.column(), e.code(), e.value())).toList();
        jdbc.update("""
                UPDATE import_job SET status = 'DONE', file = NULL, total_rows = ?, created_rows = ?, failed_rows = ?,
                       errors = CAST(? AS jsonb), finished_at = ?
                WHERE company_id = ? AND id = ?
                """, total, created, failed, json.writeValueAsString(kept), Timestamp.from(now), companyId, id);
    }

    void failed(UUID companyId, UUID id, String code, Instant now) {
        jdbc.update("""
                UPDATE import_job SET status = 'FAILED', file = NULL, failure_code = ?, finished_at = ?
                WHERE company_id = ? AND id = ?
                """, code, Timestamp.from(now), companyId, id);
    }

    private ImportResponse row(ResultSet rs, boolean withErrors) throws SQLException {
        List<ImportRowError> errors = withErrors
                ? json.readValue(rs.getString("errors"), new TypeReference<List<ImportRowError>>() { })
                : List.of();
        return new ImportResponse(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("file_name"),
                rs.getString("status"), rs.getInt("total_rows"), rs.getInt("created_rows"), rs.getInt("failed_rows"),
                errors, rs.getString("failure_code"), rs.getString("full_name"), instant(rs, "created_at"),
                rs.getTimestamp("finished_at") == null ? null : instant(rs, "finished_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant();
    }
}
