package com.tekpas.company;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** {@code user_invitation} (V22). Lookups by token are global (the token is the key), all others by company. */
@Component
class InvitationStore {

    /** The latest invitation of a user, or of a token. */
    record Invitation(UUID id, UUID companyId, UUID userId, @Nullable UUID invitedBy, Instant expiresAt,
            @Nullable Instant usedAt) {
    }

    private static final String SELECT = """
            SELECT id, company_id, user_id, invited_by, expires_at, used_at FROM user_invitation
            """;

    private final JdbcTemplate jdbc;

    InvitationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The user's earlier links stop working. */
    void replace(UUID companyId, UUID userId, String tokenHash, UUID invitedBy, Instant expiresAt) {
        jdbc.update("DELETE FROM user_invitation WHERE company_id = ? AND user_id = ?", companyId, userId);
        jdbc.update("""
                INSERT INTO user_invitation (id, company_id, user_id, token_hash, invited_by, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), companyId, userId, tokenHash, invitedBy, Timestamp.from(expiresAt));
    }

    Optional<Invitation> latestOf(UUID companyId, UUID userId) {
        return jdbc.query(SELECT + " WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
                (rs, i) -> map(rs), companyId, userId).stream().findFirst();
    }

    Optional<Invitation> byTokenHash(String tokenHash) {
        return jdbc.query(SELECT + " WHERE token_hash = ?", (rs, i) -> map(rs), tokenHash).stream().findFirst();
    }

    void markUsed(UUID id, Instant at) {
        jdbc.update("UPDATE user_invitation SET used_at = ? WHERE id = ?", Timestamp.from(at), id);
    }

    private static Invitation map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp used = rs.getTimestamp("used_at");
        return new Invitation(rs.getObject("id", UUID.class), rs.getObject("company_id", UUID.class),
                rs.getObject("user_id", UUID.class), rs.getObject("invited_by", UUID.class),
                rs.getTimestamp("expires_at").toInstant(), used == null ? null : used.toInstant());
    }
}
