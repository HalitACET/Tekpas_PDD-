package com.tekpas.batch;

import com.tekpas.batch.dto.BatchPassport;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** The newest passport version of many batches in one query (the list shows it per row). Filtered by the company. */
@Component
class PassportSummaries {

    private final NamedParameterJdbcTemplate jdbc;

    PassportSummaries(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Map<UUID, BatchPassport> of(UUID companyId, Collection<UUID> batchIds) {
        Map<UUID, BatchPassport> result = new HashMap<>();
        if (batchIds.isEmpty()) {
            return result;
        }
        jdbc.query("""
                SELECT DISTINCT ON (batch_id) batch_id, version, completeness, status
                FROM passport WHERE company_id = :companyId AND batch_id IN (:ids)
                ORDER BY batch_id, version DESC
                """, Map.of("companyId", companyId, "ids", batchIds), rs -> {
                    result.put(rs.getObject("batch_id", UUID.class), new BatchPassport(rs.getInt("version"),
                            rs.getInt("completeness"), "WITHDRAWN".equals(rs.getString("status"))));
                });
        return result;
    }
}
