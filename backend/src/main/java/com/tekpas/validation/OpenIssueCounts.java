package com.tekpas.validation;

import com.tekpas.validation.ValidationIssueRepository.OpenCount;
import com.tekpas.validation.dto.IssueCounts;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** The open issues of many batches by severity in one query (the score, the list's badge and the header read this). */
@Component
public class OpenIssueCounts {

    private final ValidationIssueRepository issues;

    OpenIssueCounts(ValidationIssueRepository issues) {
        this.issues = issues;
    }

    /** A batch with no open issue is not in the map: use {@link IssueCounts#NONE}. Filtered by the company. */
    @Transactional(readOnly = true)
    public Map<UUID, IssueCounts> of(UUID companyId, Collection<UUID> batchIds) {
        Map<UUID, IssueCounts> result = new HashMap<>();
        if (batchIds.isEmpty()) {
            return result;
        }
        Map<UUID, int[]> counts = new HashMap<>();
        for (OpenCount row : issues.openCounts(companyId, batchIds)) {
            int[] c = counts.computeIfAbsent(row.getBatchId(), id -> new int[3]);
            c[row.getSeverity() == IssueSeverity.ERROR ? 0 : row.getSeverity() == IssueSeverity.WARNING ? 1 : 2] +=
                    (int) row.getTotal();
        }
        counts.forEach((id, c) -> result.put(id, new IssueCounts(c[0], c[1], c[2])));
        return result;
    }
}
