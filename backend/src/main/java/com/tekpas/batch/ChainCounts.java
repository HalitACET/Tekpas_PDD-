package com.tekpas.batch;

import com.tekpas.batch.dto.ChainSummary;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Supply chain progress per batch (steps in total / approved). The chain itself arrives in M3. */
@Component
class ChainCounts {

    private static final ChainSummary EMPTY = new ChainSummary(0, 0);

    private final NamedParameterJdbcTemplate jdbc;

    ChainCounts(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Map<UUID, ChainSummary> of(Collection<UUID> batchIds) {
        Map<UUID, ChainSummary> result = new HashMap<>();
        if (batchIds.isEmpty()) {
            return result;
        }
        jdbc.query("""
                SELECT batch_id, count(*) AS total, count(*) FILTER (WHERE status = 'APPROVED') AS approved
                FROM supply_step WHERE batch_id IN (:ids) GROUP BY batch_id
                """, Map.of("ids", batchIds), rs -> {
                    result.put(rs.getObject("batch_id", UUID.class),
                            new ChainSummary(rs.getInt("total"), rs.getInt("approved")));
                });
        return result;
    }

    ChainSummary of(UUID batchId) {
        return of(List.of(batchId)).getOrDefault(batchId, EMPTY);
    }

    static ChainSummary orEmpty(Map<UUID, ChainSummary> counts, UUID batchId) {
        return counts.getOrDefault(batchId, EMPTY);
    }
}
