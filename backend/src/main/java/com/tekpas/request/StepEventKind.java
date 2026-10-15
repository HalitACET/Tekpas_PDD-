package com.tekpas.request;

/** What happened to a step (V6 {@code chk_step_event_kind}). */
public enum StepEventKind {
    REQUEST_CREATED,
    REQUEST_OPENED,
    REQUEST_REVOKED,
    /** The link's deadline was changed (3, 7 or 14 days from its creation). */
    REQUEST_DEADLINE_CHANGED,
    SUBMITTED,
    APPROVED,
    REJECTED,
    /** The manufacturer entered the data itself (FIBER origin): a manufacturer's declaration. */
    MANUFACTURER_ENTERED
}
