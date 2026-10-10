package com.tekpas.request;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * The step history (V6 {@code step_event}): the base of 47a's "Selin A. · 17 Eyl" and of the audit trail (M12).
 * A panel user is {@code actorUserId}; the supplier, who has no account, is the name typed in the form.
 */
@Component
public class StepEvents {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;

    public StepEvents(JdbcTemplate jdbc, ObjectMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
    }

    public void record(UUID stepId, @Nullable UUID requestId, StepEventKind kind, @Nullable UUID actorUserId,
            @Nullable String actorName, @Nullable Map<String, Object> detail) {
        jdbc.update("""
                INSERT INTO step_event (step_id, request_id, kind, actor_user_id, actor_name, detail, created_at)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?)
                """, stepId, requestId, kind.name(), actorUserId, actorName,
                detail == null ? null : json.writeValueAsString(detail), Timestamp.from(clock.instant()));
    }
}
