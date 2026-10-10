package com.tekpas.request;

/** What happened to a step (V6 {@code chk_step_event_kind}). */
public enum StepEventKind {
    REQUEST_CREATED,
    REQUEST_OPENED,
    REQUEST_REVOKED,
    SUBMITTED,
    APPROVED,
    REJECTED,
    /** The manufacturer entered the data itself (FIBER origin): a manufacturer's declaration. */
    MANUFACTURER_ENTERED
}
