package com.tekpas.task.dto;

import java.util.List;

/**
 * The tasks page and the menu badge (design v0.4 48a/b).
 *
 * @param total every item of every group: the menu badge
 * @param review "Onay bekleyen veriler" (only for OWNER and ADMIN, who can approve), oldest first
 * @param followUp "Takip bekleyen talepler": corrections without a link and expired links first, then links
 *     whose deadline is near, soonest first
 * @param incomplete "Eksik adımlar": steps without a supplier or origin, batches without a chain
 */
public record TasksResponse(int total, List<TaskItem> review, List<TaskItem> followUp, List<TaskItem> incomplete) {

    public TasksResponse {
        review = List.copyOf(review);
        followUp = List.copyOf(followUp);
        incomplete = List.copyOf(incomplete);
    }
}
