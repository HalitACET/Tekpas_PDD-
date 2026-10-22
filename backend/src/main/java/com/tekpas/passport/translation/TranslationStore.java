package com.tekpas.passport.translation;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** {@code passport_translation} (V19); every statement is filtered by the company. */
@Component
class TranslationStore {

    enum Source { AI, MANUAL }

    /** @param approvedAt set when approved; the approval holds while the source text hashes to {@code sourceHash} */
    record Stored(String field, String language, String text, Source source, String sourceHash,
            @Nullable Instant approvedAt, @Nullable String approvedByName) {

        boolean approvedFor(TranslatableText text) {
            return approvedAt != null && sourceHash.equals(text.hash());
        }

        boolean freshFor(TranslatableText text) {
            return sourceHash.equals(text.hash());
        }
    }

    private final JdbcTemplate jdbc;

    TranslationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Stored> of(UUID companyId, UUID batchId) {
        return jdbc.query("""
                SELECT t.field, t.language, t.text, t.source, t.source_hash, t.approved_at, u.full_name
                FROM passport_translation t LEFT JOIN app_user u ON u.id = t.approved_by
                WHERE t.company_id = ? AND t.batch_id = ?
                ORDER BY t.field, t.language
                """, (rs, i) -> {
            Timestamp approved = rs.getTimestamp("approved_at");
            return new Stored(rs.getString("field"), rs.getString("language"), rs.getString("text"),
                    Source.valueOf(rs.getString("source")), rs.getString("source_hash"),
                    approved == null ? null : approved.toInstant(), rs.getString("full_name"));
        }, companyId, batchId);
    }

    void upsert(UUID companyId, UUID batchId, String field, String language, String text, Source source,
            String sourceHash, @Nullable UUID approvedBy, Instant now) {
        jdbc.update("""
                INSERT INTO passport_translation (id, company_id, batch_id, field, language, text, source, source_hash,
                                                  approved_by, approved_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (batch_id, field, language) DO UPDATE
                SET text = EXCLUDED.text, source = EXCLUDED.source, source_hash = EXCLUDED.source_hash,
                    approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at,
                    updated_at = EXCLUDED.updated_at
                WHERE passport_translation.company_id = EXCLUDED.company_id
                """, UUID.randomUUID(), companyId, batchId, field, language, text, source.name(), sourceHash,
                approvedBy, approvedBy == null ? null : Timestamp.from(now), Timestamp.from(now));
    }

    /**
     * An AI suggestion, unapproved. It never replaces a translation that is approved or hand-written for the same
     * source text: someone may have approved or typed one while the LLM was answering.
     */
    void suggest(UUID companyId, UUID batchId, String field, String language, String text, String sourceHash,
            Instant now) {
        jdbc.update("""
                INSERT INTO passport_translation (id, company_id, batch_id, field, language, text, source, source_hash,
                                                  updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'AI', ?, ?)
                ON CONFLICT (batch_id, field, language) DO UPDATE
                SET text = EXCLUDED.text, source = 'AI', source_hash = EXCLUDED.source_hash, approved_by = NULL,
                    approved_at = NULL, updated_at = EXCLUDED.updated_at
                WHERE passport_translation.company_id = EXCLUDED.company_id
                  AND (passport_translation.source_hash <> EXCLUDED.source_hash
                       OR (passport_translation.source = 'AI' AND passport_translation.approved_at IS NULL))
                """, UUID.randomUUID(), companyId, batchId, field, language, text, sourceHash, Timestamp.from(now));
    }

    void delete(UUID companyId, UUID batchId, String field, String language) {
        jdbc.update("DELETE FROM passport_translation WHERE company_id = ? AND batch_id = ? AND field = ? AND language = ?",
                companyId, batchId, field, language);
    }
}
