package com.tekpas.document;

import com.tekpas.common.storage.FileStorage;
import com.tekpas.common.storage.StorageProperties;
import com.tekpas.common.storage.StoredObject;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Storage objects no document points to (docs/m10-plan.md T6): an upload whose row never committed while the
 * storage could not be reached to take it back, or a row removed the same way. Runs after the daily
 * {@code DOCUMENT_CLEANUP}; it only reports them unless {@code STORAGE_REMOVE_ORPHANS=true}. An object younger than
 * {@link #MIN_AGE} is left alone: an upload stores the object first and commits its row right after.
 */
@Component
class OrphanObjectScan {

    private static final Logger log = LoggerFactory.getLogger(OrphanObjectScan.class);

    /** Where {@link DocumentStore} puts every document ({@code docs/<company>/<document>}). */
    static final String PREFIX = "docs";
    static final Duration MIN_AGE = Duration.ofHours(1);
    /** How many keys the log names; the count is always complete. */
    static final int LOGGED_KEYS = 20;

    /** @param orphans keys no document points to, old enough to judge; removed only when {@code removed} says so */
    record Result(int scanned, List<String> orphans, boolean removed) {
    }

    private final FileStorage storage;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final boolean remove;

    OrphanObjectScan(FileStorage storage, JdbcTemplate jdbc, Clock clock, StorageProperties properties) {
        this.storage = storage;
        this.jdbc = jdbc;
        this.clock = clock;
        this.remove = properties.removeOrphans();
    }

    Result run() {
        // Listed first: a document saved meanwhile has its object in the listing and its row in the query below.
        List<StoredObject> objects = storage.list(PREFIX);
        Set<String> referenced = new HashSet<>(
                jdbc.queryForList("SELECT file_key FROM document WHERE file_key LIKE ?", String.class, PREFIX + "/%"));
        Instant settled = clock.instant().minus(MIN_AGE);
        List<String> orphans = objects.stream()
                .filter(o -> o.createdAt().isBefore(settled) && !referenced.contains(o.key()))
                .map(StoredObject::key).sorted().toList();
        if (!orphans.isEmpty()) {
            if (remove) {
                orphans.forEach(storage::delete);
            }
            log.warn("{} storage object(s) without a document{}: {}{}", orphans.size(),
                    remove ? ", removed" : " (reported only, STORAGE_REMOVE_ORPHANS=false)",
                    orphans.subList(0, Math.min(LOGGED_KEYS, orphans.size())),
                    orphans.size() > LOGGED_KEYS ? " …" : "");
        }
        return new Result(objects.size(), orphans, remove && !orphans.isEmpty());
    }
}
