package com.tekpas.batch;

import io.swagger.v3.oas.annotations.media.Schema;

/** The three criteria of the compliance score; the weights are in {@link ComplianceScore}. */
@Schema(enumAsRef = true)
public enum CriterionCode {
    STEPS_APPROVED, REQUIRED_FIELDS, VALID_CERTIFICATES
}
