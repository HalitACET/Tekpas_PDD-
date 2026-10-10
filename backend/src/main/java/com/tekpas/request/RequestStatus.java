package com.tekpas.request;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A data request link (V1 {@code chk_request_status}). SENT and OPENED are open; EXPIRED is set when an open
 * link is read after its deadline.
 */
@Schema(enumAsRef = true)
public enum RequestStatus {
    SENT,
    OPENED,
    COMPLETED,
    EXPIRED,
    REVOKED;

    public boolean isOpen() {
        return this == SENT || this == OPENED;
    }
}
