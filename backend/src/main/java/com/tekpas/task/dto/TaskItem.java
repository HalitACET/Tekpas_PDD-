package com.tekpas.task.dto;

import com.tekpas.supplychain.StepType;
import com.tekpas.task.TaskKind;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One row of the tasks page (design v0.4 48a). Which fields are set depends on the kind.
 *
 * @param stepId null for NO_CHAIN
 * @param supplierName the step's supplier, if assigned
 * @param supplierPhone the manufacturer's number for that supplier (E.164), if known: where "Hatırlat" goes
 * @param at submitted (STEP_SUBMITTED) or correction asked (CORRECTION_NO_LINK)
 * @param deadline the link's deadline (LINK_EXPIRING, LINK_EXPIRED)
 * @param openCount how often the link was opened (LINK_EXPIRING, LINK_EXPIRED)
 * @param submitterName who sent the data (STEP_SUBMITTED)
 * @param filledFields how many fields the data has (STEP_SUBMITTED, "5 alan")
 */
public record TaskItem(
        TaskKind kind,
        UUID batchId,
        String batchNo,
        String productName,
        @Nullable UUID stepId,
        @Nullable StepType stepType,
        @Nullable String supplierName,
        @Nullable String supplierPhone,
        @Nullable Instant at,
        @Nullable Instant deadline,
        @Nullable Integer openCount,
        @Nullable String submitterName,
        @Nullable Integer filledFields) {
}
