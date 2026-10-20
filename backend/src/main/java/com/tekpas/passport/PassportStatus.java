package com.tekpas.passport;

import io.swagger.v3.oas.annotations.media.Schema;

/** V1 {@code chk_passport_status}. A version only moves PUBLISHED → SUPERSEDED or PUBLISHED → WITHDRAWN (V11 trigger). */
@Schema(enumAsRef = true)
public enum PassportStatus {
    PUBLISHED, SUPERSEDED, WITHDRAWN
}
