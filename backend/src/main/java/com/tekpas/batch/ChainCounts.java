package com.tekpas.batch;

import com.tekpas.batch.dto.ChainSummary;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Supply chain progress per batch: the step statuses in chain order (same order as GET /batches/{id}/chain). */
@Component
class ChainCounts {

    private static final ChainSummary EMPTY = ChainSummary.of(List.of());
    private static final String[] TYPE_ORDER = Arrays.stream(StepType.values()).map(Enum::name).toArray(String[]::new);

    private final NamedParameterJdbcTemplate jdbc;

    ChainCounts(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Map<UUID, ChainSummary> of(Collection<UUID> batchIds) {
        Map<UUID, ChainSummary> result = new HashMap<>();
        if (batchIds.isEmpty()) {
            return result;
        }
        Map<UUID, List<StepStatus>> statuses = new LinkedHashMap<>();
        jdbc.query("""
                SELECT batch_id, status FROM supply_step WHERE batch_id IN (:ids)
                ORDER BY batch_id, array_position(CAST(:types AS text[]), step_type), sort_order, created_at, id
                """, Map.of("ids", batchIds, "types", TYPE_ORDER), rs -> {
                    statuses.computeIfAbsent(rs.getObject("batch_id", UUID.class), id -> new ArrayList<>())
                            .add(StepStatus.valueOf(rs.getString("status")));
                });
        statuses.forEach((id, list) -> result.put(id, ChainSummary.of(list)));
        return result;
    }

    ChainSummary of(UUID batchId) {
        return of(List.of(batchId)).getOrDefault(batchId, EMPTY);
    }

    static ChainSummary orEmpty(Map<UUID, ChainSummary> counts, UUID batchId) {
        return counts.getOrDefault(batchId, EMPTY);
    }
}
