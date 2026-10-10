package com.tekpas.request;

/** What happened to a step (V6 {@code chk_step_event_kind}). */
public enum StepEventKind {
    REQUEST_CREATED,
    REQUEST_OPENED,
    REQUEST_REVOKED,
    SUBMITTED,
    APPROVED,
    REJECTED,
    ORIGIN_RECORDED
}
