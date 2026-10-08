package com.tekpas.supplychain;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The edges of a chain: {@code supply_step_input(step_id, input_step_id)} = "step uses input's output". The
 * callers check that both steps belong to the same batch; this class keeps the graph acyclic.
 */
@Component
class ChainLinks {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    ChainLinks(JdbcTemplate jdbc, NamedParameterJdbcTemplate named) {
        this.jdbc = jdbc;
        this.named = named;
    }

    /** step id → its input step ids, for the given steps. */
    Map<UUID, List<UUID>> inputsOf(Collection<UUID> stepIds) {
        Map<UUID, List<UUID>> inputs = new HashMap<>();
        if (stepIds.isEmpty()) {
            return inputs;
        }
        named.query("""
                SELECT step_id, input_step_id FROM supply_step_input WHERE step_id IN (:ids)
                ORDER BY step_id, input_step_id
                """, Map.of("ids", stepIds), rs -> {
                    inputs.computeIfAbsent(rs.getObject("step_id", UUID.class), k -> new ArrayList<>())
                            .add(rs.getObject("input_step_id", UUID.class));
                });
        return inputs;
    }

    /**
     * Would "step uses input" close a cycle? It does when step is already upstream of input (reachable by
     * following input's inputs), or when both are the same step.
     */
    boolean wouldCycle(UUID stepId, UUID inputStepId) {
        if (stepId.equals(inputStepId)) {
            return true;
        }
        Boolean found = jdbc.queryForObject("""
                WITH RECURSIVE upstream(id) AS (
                    SELECT input_step_id FROM supply_step_input WHERE step_id = ?
                    UNION
                    SELECT si.input_step_id FROM supply_step_input si JOIN upstream u ON si.step_id = u.id
                )
                SELECT EXISTS (SELECT 1 FROM upstream WHERE id = ?)
                """, Boolean.class, inputStepId, stepId);
        return Boolean.TRUE.equals(found);
    }

    void add(UUID stepId, UUID inputStepId) {
        jdbc.update("INSERT INTO supply_step_input (step_id, input_step_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
                stepId, inputStepId);
    }

    void removeInputsOf(UUID stepId) {
        jdbc.update("DELETE FROM supply_step_input WHERE step_id = ?", stepId);
    }

    /** Batch ids of the given steps (to check that links stay within one batch). */
    Map<UUID, UUID> batchOf(Collection<UUID> stepIds) {
        Map<UUID, UUID> batches = new HashMap<>();
        if (stepIds.isEmpty()) {
            return batches;
        }
        named.query("SELECT id, batch_id FROM supply_step WHERE id IN (:ids)", Map.of("ids", stepIds),
                rs -> {
                    batches.put(rs.getObject("id", UUID.class), rs.getObject("batch_id", UUID.class));
                });
        return batches;
    }
}
