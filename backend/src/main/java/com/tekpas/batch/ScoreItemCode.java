package com.tekpas.batch;

import io.swagger.v3.oas.annotations.media.Schema;

/** What a score item is about. */
@Schema(enumAsRef = true)
public enum ScoreItemCode {
    /** STEPS_APPROVED: the step is approved. */
    STEP_APPROVED,
    /** REQUIRED_FIELDS: the step's required fields are filled. */
    STEP_FIELDS,
    /** REQUIRED_FIELDS: the product's declared fibre composition is set (adds up to 100). */
    PRODUCT_FIBERS,
    /** REQUIRED_FIELDS: the product has a category. */
    PRODUCT_CATEGORY,
    /** REQUIRED_FIELDS: the batch has both production dates. */
    BATCH_DATES,
    /** VALID_CERTIFICATES: the step has a confirmed certificate that is still valid. */
    STEP_CERTIFICATE
}
