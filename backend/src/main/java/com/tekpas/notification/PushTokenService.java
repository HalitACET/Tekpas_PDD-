package com.tekpas.notification;

import com.tekpas.common.error.NotFoundException;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The phones that receive the user's notifications (V2 {@code push_token}, docs/m9-plan.md §4.2). A token is the
 * phone's, not the account's: when another person signs in on the same phone it moves to them.
 */
@Service
public class PushTokenService {

    private final JdbcTemplate jdbc;

    PushTokenService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Binds the token to the user, also when it was someone else's; one statement, so two calls cannot race. */
    @Transactional
    public void register(UUID userId, String token, PushPlatform platform) {
        jdbc.update("""
                INSERT INTO push_token (user_id, expo_token, platform) VALUES (?, ?, ?)
                ON CONFLICT (expo_token) DO UPDATE
                    SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()""",
                userId, token, platform.name());
    }

    /** Only the user's own token; another one is answered like a missing one. */
    @Transactional
    public void remove(UUID userId, String token) {
        if (jdbc.update("DELETE FROM push_token WHERE expo_token = ? AND user_id = ?", token, userId) == 0) {
            throw new NotFoundException("Push token not found");
        }
    }
}
