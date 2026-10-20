package com.tekpas.jobs;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The job table (V2, V9) in plain SQL. Every statement is a single auto-committed one: a claimed job is marked
 * RUNNING at once, so the handler runs without an open transaction or a held row lock. Times come from the
 * application clock, not the database's, so tests can move time.
 */
@Component
class JobStore {

    static final int MAX_ERROR_LENGTH = 500;

    record ClaimedJob(long id, JobType type, String payload, int attempt, int maxAttempts) {
    }

    private final JdbcTemplate jdbc;

    JobStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    long insert(JobType type, String payloadJson, Instant runAt) {
        Long id = jdbc.queryForObject("""
                INSERT INTO job (type, payload, max_attempts, run_at, created_at)
                VALUES (?, CAST(? AS jsonb), ?, ?, ?)
                RETURNING id
                """, Long.class, type.name(), payloadJson, type.maxAttempts(), ts(runAt), ts(runAt));
        return id == null ? -1 : id;
    }

    /**
     * Takes the next due job of the given types and marks it RUNNING with one more attempt. {@code SKIP LOCKED}:
     * two workers never take the same job, and neither waits for the other.
     */
    Optional<ClaimedJob> claim(Collection<JobType> types, String workerId, Instant now) {
        if (types.isEmpty()) {
            return Optional.empty();
        }
        List<ClaimedJob> claimed = jdbc.query("""
                UPDATE job SET status = 'RUNNING', attempts = attempts + 1, locked_at = ?, locked_by = ?
                WHERE id = (
                    SELECT id FROM job
                    WHERE status = 'QUEUED' AND run_at <= ? AND attempts < max_attempts AND type IN (%s)
                    ORDER BY priority DESC, run_at, id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED)
                RETURNING id, type, payload::text AS payload, attempts, max_attempts
                """.formatted(in(types)), JobStore::claimed, ts(now), workerId, ts(now));
        return claimed.stream().findFirst();
    }

    void complete(long id, Instant now) {
        jdbc.update("""
                UPDATE job SET status = 'DONE', finished_at = ?, locked_at = NULL, locked_by = NULL, last_error = NULL
                WHERE id = ? AND status = 'RUNNING'
                """, ts(now), id);
    }

    void retry(long id, Instant runAt, String error) {
        jdbc.update("""
                UPDATE job SET status = 'QUEUED', run_at = ?, locked_at = NULL, locked_by = NULL, last_error = ?
                WHERE id = ? AND status = 'RUNNING'
                """, ts(runAt), truncate(error), id);
    }

    /** FAILED (no point retrying) or DEAD (attempts used up). */
    void end(long id, String status, String error, Instant now) {
        jdbc.update("""
                UPDATE job SET status = ?, finished_at = ?, locked_at = NULL, locked_by = NULL, last_error = ?
                WHERE id = ? AND status = 'RUNNING'
                """, status, ts(now), truncate(error), id);
    }

    /**
     * Jobs left RUNNING by a process that stopped (crash, deploy, Render putting the instance to sleep): queued
     * again at once, or DEAD when their attempts are used up. Returns the ones that ended, for onGiveUp.
     */
    List<ClaimedJob> recoverStale(Instant lockedBefore, Instant now) {
        return jdbc.query("""
                UPDATE job SET
                    status = CASE WHEN attempts >= max_attempts THEN 'DEAD' ELSE 'QUEUED' END,
                    finished_at = CASE WHEN attempts >= max_attempts THEN CAST(? AS timestamptz) ELSE NULL END,
                    run_at = ?, locked_at = NULL, locked_by = NULL,
                    last_error = 'Worker stopped during the attempt (recovered)'
                WHERE status = 'RUNNING' AND locked_at < ?
                RETURNING id, type, payload::text AS payload, attempts, max_attempts, status
                """, (rs, n) -> "DEAD".equals(rs.getString("status")) ? claimed(rs, n) : null,
                ts(now), ts(now), ts(lockedBefore)).stream().filter(j -> j != null).toList();
    }

    /** When the next queued job of these types becomes due, if any. */
    Optional<Instant> nextRunAt(Collection<JobType> types) {
        if (types.isEmpty()) {
            return Optional.empty();
        }
        Timestamp next = jdbc.queryForObject("""
                SELECT min(run_at) FROM job WHERE status = 'QUEUED' AND attempts < max_attempts AND type IN (%s)
                """.formatted(in(types)), Timestamp.class);
        return Optional.ofNullable(next).map(Timestamp::toInstant);
    }

    /** A job of this type is waiting or running, or was queued after {@code since}. */
    boolean hasRecent(JobType type, Instant since) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM job WHERE type = ? AND (status IN ('QUEUED', 'RUNNING') OR created_at > ?))
                """, Boolean.class, type.name(), ts(since)));
    }

    /** A job of this type with exactly this payload is waiting to start: it will see whatever changed since. */
    boolean hasQueued(JobType type, String payloadJson) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM job WHERE type = ? AND status = 'QUEUED' AND payload = CAST(? AS jsonb))
                """, Boolean.class, type.name(), payloadJson));
    }

    private static ClaimedJob claimed(ResultSet rs, int row) throws SQLException {
        return new ClaimedJob(rs.getLong("id"), JobType.valueOf(rs.getString("type")), rs.getString("payload"),
                rs.getInt("attempts"), rs.getInt("max_attempts"));
    }

    /** Enum constants only, so the list is safe to inline. */
    private static String in(Collection<JobType> types) {
        return types.stream().map(t -> "'" + t.name() + "'").collect(Collectors.joining(", "));
    }

    private static Timestamp ts(Instant instant) {
        return Timestamp.from(instant);
    }

    private static String truncate(String error) {
        return error.length() <= MAX_ERROR_LENGTH ? error : error.substring(0, MAX_ERROR_LENGTH);
    }
}
