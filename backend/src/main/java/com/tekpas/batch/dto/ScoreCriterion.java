package com.tekpas.batch.dto;

import com.tekpas.batch.CriterionCode;
import java.util.List;

/** One criterion: the points earned out of the points it can give, and what each point was earned by. */
public record ScoreCriterion(CriterionCode code, int earned, int possible, List<ScoreItem> items) {

    public ScoreCriterion {
        items = List.copyOf(items);
    }
}
