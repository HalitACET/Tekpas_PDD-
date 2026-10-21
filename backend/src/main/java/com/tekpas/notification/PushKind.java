package com.tekpas.notification;

/** What a notification is about (docs/m9-plan.md §4.3). */
public enum PushKind {
    /** A supplier submitted a step's data: OWNER and ADMIN may approve it. */
    STEP_SUBMITTED,
    /** Confirmed certificates entered the warning days today: one summary a company. */
    CERTS_EXPIRING
}
