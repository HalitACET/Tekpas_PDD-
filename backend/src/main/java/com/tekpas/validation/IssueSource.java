package com.tekpas.validation;

import io.swagger.v3.oas.annotations.media.Schema;

/** V1 {@code chk_issue_source}: a rule or (second phase) an AI suggestion that a person decides on. */
@Schema(enumAsRef = true)
public enum IssueSource {
    RULE, AI
}
