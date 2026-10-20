package com.tekpas.validation;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Makes the stored issues of a batch say what the rules say now (docs/m7-plan.md §3), a function of the stored rows
 * and the findings. It changes the stored rows it is given and returns the ones to add; the caller saves them, in the
 * transaction that holds the batch's lock.
 *
 * <ul>
 * <li>new finding: a new open issue;
 * <li>open and still found: seen again;
 * <li>open and no longer found: closes itself ({@code autoResolved});
 * <li>resolved by a person and still found: stays resolved, nobody has to decide the same thing twice;
 * <li>closed by itself and found again: opens again (its row is the one for this fingerprint);
 * <li>resolved by a person and no longer found: stays as it is, a record of the decision.
 * </ul>
 *
 * A finding whose data changed has another fingerprint, so it is a new issue.
 */
final class IssueSync {

    /** What a run changed, for the log. */
    record Result(List<ValidationIssue> created, int seen, int closed, int reopened) {
    }

    private IssueSync() {
    }

    static Result apply(UUID batchId, UUID companyId, IssueSource source, List<ValidationIssue> stored,
            List<Finding> found, Instant now) {
        Map<String, ValidationIssue> byFingerprint = new HashMap<>();
        for (ValidationIssue issue : stored) {
            if (issue.getSource() == source) {
                byFingerprint.put(issue.getFingerprint(), issue);
            }
        }
        Map<String, Finding> findings = new LinkedHashMap<>();
        for (Finding finding : found) {
            findings.putIfAbsent(finding.fingerprint(), finding);
        }

        List<ValidationIssue> created = new ArrayList<>();
        int seen = 0;
        int closed = 0;
        int reopened = 0;
        for (Finding finding : findings.values()) {
            ValidationIssue issue = byFingerprint.get(finding.fingerprint());
            if (issue == null) {
                created.add(ValidationIssue.open(batchId, companyId, source, finding, now));
            } else if (!issue.isResolved()) {
                issue.seen(finding, now);
                seen++;
            } else if (issue.isAutoResolved()) {
                issue.reappear(finding, now);
                reopened++;
            }
        }
        for (Map.Entry<String, ValidationIssue> entry : byFingerprint.entrySet()) {
            ValidationIssue issue = entry.getValue();
            if (!issue.isResolved() && !findings.containsKey(entry.getKey())) {
                issue.autoResolve(now);
                closed++;
            }
        }
        return new Result(created, seen, closed, reopened);
    }
}
