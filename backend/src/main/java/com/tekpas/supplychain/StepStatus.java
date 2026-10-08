package com.tekpas.supplychain;

import io.swagger.v3.oas.annotations.media.Schema;

/** V1 {@code chk_step_status}. Approve/reject and the supplier's submission arrive in M4. */
@Schema(enumAsRef = true)
public enum StepStatus {
    PENDING,
    SUBMITTED,
    APPROVED,
    REJECTED
}
