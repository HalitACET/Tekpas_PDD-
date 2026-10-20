package com.tekpas.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The sync rule of docs/m7-plan.md §3: new, again, closed by itself, kept resolved, new when the data changed. */
class IssueSyncTest {

    private static final UUID BATCH = UUID.randomUUID();
    private static final UUID COMPANY = UUID.randomUUID();
    private static final UUID PERSON = UUID.randomUUID();
    private static final Instant T0 = Instant.parse("2026-10-15T09:00:00Z");
    private static final Instant T1 = Instant.parse("2026-10-15T10:00:00Z");

    private static Finding finding(IssueCode code, String data) {
        return new Finding(code, null, null, IssueParams.EMPTY, code.code() + ":" + data, "message " + data);
    }

    private static ValidationIssue stored(Finding finding) {
        return ValidationIssue.open(BATCH, COMPANY, IssueSource.RULE, finding, T0);
    }

    private static IssueSync.Result sync(List<ValidationIssue> stored, Finding... found) {
        return IssueSync.apply(BATCH, COMPANY, IssueSource.RULE, stored, List.of(found), T1);
    }

    @Test
    void aNewFindingOpensAnIssueWithItsCodeSeverityAndSource() {
        Finding finding = finding(IssueCode.SER_02, "2026-11-01");

        IssueSync.Result result = sync(List.of(), finding);

        assertThat(result.created()).hasSize(1);
        ValidationIssue issue = result.created().getFirst();
        assertThat(issue.getCode()).isEqualTo(IssueCode.SER_02);
        assertThat(issue.getSeverity()).isEqualTo(IssueSeverity.WARNING);
        assertThat(issue.getSource()).isEqualTo(IssueSource.RULE);
        assertThat(issue.getBatchId()).isEqualTo(BATCH);
        assertThat(issue.getCompanyId()).isEqualTo(COMPANY);
        assertThat(issue.isResolved()).isFalse();
        assertThat(issue.getCreatedAt()).isEqualTo(T1);
    }

    @Test
    void anOpenFindingFoundAgainIsSeenNotDuplicated() {
        Finding finding = finding(IssueCode.EKS_01, "");
        ValidationIssue issue = stored(finding);

        IssueSync.Result result = sync(List.of(issue), finding);

        assertThat(result.created()).isEmpty();
        assertThat(result.seen()).isEqualTo(1);
        assertThat(issue.getLastSeenAt()).isEqualTo(T1);
        assertThat(issue.isResolved()).isFalse();
    }

    @Test
    void anOpenFindingThatIsGoneClosesItselfWithoutAnyone() {
        ValidationIssue issue = stored(finding(IssueCode.LIF_01, "a"));

        IssueSync.Result result = sync(List.of(issue));

        assertThat(result.closed()).isEqualTo(1);
        assertThat(issue.isResolved()).isTrue();
        assertThat(issue.isAutoResolved()).isTrue();
        assertThat(issue.getResolvedBy()).isNull();
        assertThat(issue.getResolvedAt()).isEqualTo(T1);
    }

    @Test
    void aWarningAPersonResolvedStaysResolvedWhileItIsStillFound() {
        Finding finding = finding(IssueCode.SER_03, "x");
        ValidationIssue issue = stored(finding);
        issue.resolve(PERSON, "Aynı firma", T0);

        IssueSync.Result result = sync(List.of(issue), finding);

        assertThat(result.created()).isEmpty();
        assertThat(issue.isResolved()).isTrue();
        assertThat(issue.isAutoResolved()).isFalse();
        assertThat(issue.getResolvedBy()).isEqualTo(PERSON);
        assertThat(issue.getResolutionNote()).isEqualTo("Aynı firma");
    }

    @Test
    void aDecisionIsKeptAsARecordWhenTheFindingIsGone() {
        ValidationIssue issue = stored(finding(IssueCode.SER_03, "x"));
        issue.resolve(PERSON, null, T0);

        sync(List.of(issue));

        assertThat(issue.isResolved()).isTrue();
        assertThat(issue.isAutoResolved()).isFalse();
        assertThat(issue.getResolvedBy()).isEqualTo(PERSON);
    }

    @Test
    void whenTheDataChangedItIsANewIssueAndTheOldOneCloses() {
        ValidationIssue old = stored(finding(IssueCode.LIF_01, "80/20"));
        Finding changed = finding(IssueCode.LIF_01, "70/30");

        IssueSync.Result result = sync(List.of(old), changed);

        assertThat(result.created()).hasSize(1);
        assertThat(result.created().getFirst().getFingerprint()).isEqualTo(changed.fingerprint());
        assertThat(old.isAutoResolved()).isTrue();
    }

    @Test
    void anIssueThatClosedItselfOpensAgainWhenTheSameDataGoesWrongAgain() {
        Finding finding = finding(IssueCode.LIF_01, "a");
        ValidationIssue issue = stored(finding);
        sync(List.of(issue));
        assertThat(issue.isAutoResolved()).isTrue();

        IssueSync.Result result = IssueSync.apply(BATCH, COMPANY, IssueSource.RULE, List.of(issue), List.of(finding),
                T1.plusSeconds(60));

        assertThat(result.created()).isEmpty();
        assertThat(result.reopened()).isEqualTo(1);
        assertThat(issue.isResolved()).isFalse();
        assertThat(issue.isAutoResolved()).isFalse();
        assertThat(issue.getResolvedAt()).isNull();
    }

    @Test
    void aFindingTwiceInOneRunIsOneIssue() {
        Finding finding = finding(IssueCode.BEL_01, "doc");

        assertThat(sync(List.of(), finding, finding).created()).hasSize(1);
    }

    @Test
    void issuesOfAnotherSourceAreNotTouched() {
        Finding ai = finding(IssueCode.BEL_01, "ai");
        ValidationIssue fromAi = ValidationIssue.open(BATCH, COMPANY, IssueSource.AI, ai, T0);

        sync(List.of(fromAi));

        assertThat(fromAi.isResolved()).isFalse();
    }
}
