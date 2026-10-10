package com.tekpas.task;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a task asks for (design v0.4 48a). */
@Schema(enumAsRef = true)
public enum TaskKind {
    /** "Onay bekleyen veriler": the supplier submitted, the step waits for review (OWNER, ADMIN). */
    STEP_SUBMITTED,
    /** "Takip bekleyen talepler": a correction was asked, but no new link was sent. */
    CORRECTION_NO_LINK,
    /** The link expired without a submission. */
    LINK_EXPIRED,
    /** The link's deadline is less than 2 days away. */
    LINK_EXPIRING,
    /** "Eksik adımlar": a step without a supplier. */
    STEP_UNASSIGNED,
    /** The fibre step has no origin yet (the manufacturer enters it). */
    ORIGIN_MISSING,
    /** A batch without a supply chain. */
    NO_CHAIN
}
