package com.tekpas.batch.dto;

import java.util.List;

/**
 * The compliance score of a batch (docs/m6-plan.md §2): 0–100, the three criteria it is made of, what blocks
 * publishing whatever the score is, and what only deserves a look. Computed on every read, never stored.
 */
public record ScoreResponse(
        int score,
        int threshold,
        boolean publishable,
        List<ScoreCriterion> criteria,
        List<ScoreIssue> blockers,
        List<ScoreIssue> warnings) {

    public ScoreResponse {
        criteria = List.copyOf(criteria);
        blockers = List.copyOf(blockers);
        warnings = List.copyOf(warnings);
    }
}
