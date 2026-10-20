package com.tekpas.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.document.DocType;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import com.tekpas.validation.ConsistencyRules.DocumentFacts;
import com.tekpas.validation.ConsistencyRules.Facts;
import com.tekpas.validation.ConsistencyRules.StepFacts;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** The rule table of docs/m7-plan.md §2: one rule at a time, both sides of every limit. */
class ConsistencyRulesTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 15);
    private static final LocalDate FROM = LocalDate.of(2026, 9, 1);
    private static final LocalDate TO = LocalDate.of(2026, 9, 10);
    private static final List<FiberShare> LABEL = List.of(share(Fiber.ORGANIC_COTTON, 95), share(Fiber.ELASTANE, 5));

    private static FiberShare share(Fiber fiber, int percent) {
        return new FiberShare(fiber, percent);
    }

    private static StepFacts step(StepType type, StepStatus status, List<FiberShare> composition, String supplier,
            DocumentFacts... documents) {
        return new StepFacts(UUID.randomUUID(), type, status, composition, supplier, List.of(documents));
    }

    private static DocumentFacts cert(DocType type, LocalDate until, String holder) {
        return new DocumentFacts(UUID.randomUUID(), type, true, until, holder, type + ".pdf");
    }

    private static Facts facts(List<FiberShare> label, StepFacts... steps) {
        return new Facts(label, FROM, TO, List.of(steps));
    }

    private static List<IssueCode> codes(List<Finding> found) {
        return found.stream().map(Finding::code).toList();
    }

    private static List<Finding> check(Facts facts) {
        return ConsistencyRules.check(facts, TODAY);
    }

    // --- LIF-01 -----------------------------------------------------------------------------------------------------

    @Test
    void labelAndYarnThatDifferByMoreThanTheToleranceAreBlocking() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED,
                List.of(share(Fiber.ORGANIC_COTTON, 80), share(Fiber.POLYESTER, 20)), "Ege İplik");

        List<Finding> found = check(facts(LABEL, yarn));

        assertThat(codes(found)).contains(IssueCode.LIF_01);
        Finding lif = found.stream().filter(f -> f.code() == IssueCode.LIF_01).findFirst().orElseThrow();
        assertThat(lif.severity()).isEqualTo(IssueSeverity.ERROR);
        assertThat(lif.stepId()).isEqualTo(yarn.id());
        assertThat(lif.params().label()).isEqualTo(LABEL);
        assertThat(lif.params().declared()).isEqualTo(yarn.composition());
        // Cotton 95 vs 80, elastane only on the label, polyester only on the step.
        assertThat(lif.params().differing()).containsExactly(Fiber.ORGANIC_COTTON, Fiber.ELASTANE, Fiber.POLYESTER);
    }

    @Test
    void theToleranceIsThreePointsAndThreeIsStillFine() {
        StepFacts fabric = step(StepType.FABRIC, StepStatus.APPROVED,
                List.of(share(Fiber.ORGANIC_COTTON, 92), share(Fiber.ELASTANE, 8)), "Demirtaş");
        assertThat(codes(check(facts(LABEL, fabric)))).doesNotContain(IssueCode.LIF_01);

        StepFacts over = step(StepType.FABRIC, StepStatus.APPROVED,
                List.of(share(Fiber.ORGANIC_COTTON, 91), share(Fiber.ELASTANE, 9)), "Demirtaş");
        assertThat(codes(check(facts(LABEL, over)))).contains(IssueCode.LIF_01);
    }

    @Test
    void aFibreOnlyOneSideHasIsADifferenceHoweverSmall() {
        List<FiberShare> label = List.of(share(Fiber.ORGANIC_COTTON, 100));
        StepFacts yarn = step(StepType.YARN, StepStatus.SUBMITTED,
                List.of(share(Fiber.ORGANIC_COTTON, 99), share(Fiber.ELASTANE, 1)), "Ege İplik");

        Finding lif = check(facts(label, yarn)).stream().filter(f -> f.code() == IssueCode.LIF_01).findFirst()
                .orElseThrow();

        assertThat(lif.params().differing()).containsExactly(Fiber.ELASTANE);
    }

    @Test
    void theFabricIsWhatTheLabelDescribesSoTheYarnIsLeftAloneWhenThereIsOne() {
        // A cotton yarn and an elastane yarn make the 95/5 fabric: neither yarn alone is the label.
        StepFacts cotton = step(StepType.YARN, StepStatus.APPROVED, List.of(share(Fiber.ORGANIC_COTTON, 100)), "A");
        StepFacts elastane = step(StepType.YARN, StepStatus.APPROVED, List.of(share(Fiber.ELASTANE, 100)), "B");
        StepFacts fabric = step(StepType.FABRIC, StepStatus.APPROVED, LABEL, "C");

        assertThat(codes(check(facts(LABEL, cotton, elastane, fabric)))).doesNotContain(IssueCode.LIF_01);
        // Several yarns and no fabric: nothing to compare with.
        assertThat(codes(check(facts(LABEL, cotton, elastane)))).doesNotContain(IssueCode.LIF_01);
    }

    @Test
    void eachFabricStepThatDiffersGetsItsOwnIssue() {
        StepFacts good = step(StepType.FABRIC, StepStatus.APPROVED, LABEL, "A");
        StepFacts bad1 = step(StepType.FABRIC, StepStatus.APPROVED, List.of(share(Fiber.POLYESTER, 100)), "B");
        StepFacts bad2 = step(StepType.FABRIC, StepStatus.SUBMITTED, List.of(share(Fiber.VISCOSE, 100)), "C");

        List<Finding> lif = check(facts(LABEL, good, bad1, bad2)).stream().filter(f -> f.code() == IssueCode.LIF_01)
                .toList();

        assertThat(lif).extracting(Finding::stepId).containsExactlyInAnyOrder(bad1.id(), bad2.id());
        assertThat(lif).extracting(Finding::fingerprint).doesNotHaveDuplicates();
    }

    @Test
    void stepsWithoutDataOrNotYetSubmittedAreNotCompared() {
        StepFacts pending = step(StepType.YARN, StepStatus.PENDING, List.of(share(Fiber.POLYESTER, 100)), "A");
        StepFacts empty = step(StepType.FABRIC, StepStatus.APPROVED, List.of(), "B");

        assertThat(codes(check(facts(LABEL, pending, empty)))).doesNotContain(IssueCode.LIF_01, IssueCode.LIF_02);
    }

    @Test
    void theSameDataGivesTheSameFingerprintAndOtherDataAnother() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED, List.of(share(Fiber.POLYESTER, 100)), "A");
        StepFacts reordered = new StepFacts(yarn.id(), yarn.type(), yarn.status(), yarn.composition(), "A", List.of());
        StepFacts changed = new StepFacts(yarn.id(), yarn.type(), yarn.status(),
                List.of(share(Fiber.POLYESTER, 60), share(Fiber.VISCOSE, 40)), "A", List.of());

        String first = fingerprintOf(check(facts(LABEL, yarn)), IssueCode.LIF_01);
        assertThat(fingerprintOf(check(facts(LABEL, reordered)), IssueCode.LIF_01)).isEqualTo(first);
        assertThat(fingerprintOf(check(facts(LABEL, changed)), IssueCode.LIF_01)).isNotEqualTo(first);
        assertThat(first).hasSizeLessThanOrEqualTo(200);
    }

    private static String fingerprintOf(List<Finding> found, IssueCode code) {
        return found.stream().filter(f -> f.code() == code).findFirst().orElseThrow().fingerprint();
    }

    // --- LIF-02 -----------------------------------------------------------------------------------------------------

    @Test
    void aCompositionThatDoesNotAddUpTo100IsBlocking() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED,
                List.of(share(Fiber.ORGANIC_COTTON, 60), share(Fiber.ELASTANE, 30)), "A");

        List<Finding> found = check(facts(List.of(share(Fiber.COTTON, 90)), yarn));

        List<Finding> lif02 = found.stream().filter(f -> f.code() == IssueCode.LIF_02).toList();
        assertThat(lif02).hasSize(2);
        assertThat(lif02).extracting(Finding::stepId).containsExactlyInAnyOrder(null, yarn.id());
        assertThat(lif02).extracting(f -> f.params().total()).containsExactlyInAnyOrder(90, 90);
        // Neither side can be compared with the other while one of them is not a whole.
        assertThat(codes(found)).doesNotContain(IssueCode.LIF_01);
    }

    // --- SER-01, SER-02 ---------------------------------------------------------------------------------------------

    @Test
    void anExpiredConfirmedCertificateIsBlockingUnlessTheStepHoldsANewerOfTheSameType() {
        DocumentFacts old = cert(DocType.GOTS, TODAY.minusDays(3), "Ege İplik");
        StepFacts expired = step(StepType.YARN, StepStatus.APPROVED, null, "Ege İplik", old);
        List<Finding> found = check(facts(LABEL, expired));
        Finding ser = found.stream().filter(f -> f.code() == IssueCode.SER_01).findFirst().orElseThrow();
        assertThat(ser.severity()).isEqualTo(IssueSeverity.ERROR);
        assertThat(ser.documentId()).isEqualTo(old.id());
        assertThat(ser.params().docType()).isEqualTo(DocType.GOTS);
        assertThat(ser.params().validUntil()).isEqualTo(TODAY.minusDays(3));

        StepFacts renewed = step(StepType.YARN, StepStatus.APPROVED, null, "Ege İplik", old,
                cert(DocType.GOTS, TODAY.plusDays(300), "Ege İplik"));
        assertThat(codes(check(facts(LABEL, renewed)))).doesNotContain(IssueCode.SER_01, IssueCode.SER_02);

        // A different type does not replace it.
        StepFacts other = step(StepType.YARN, StepStatus.APPROVED, null, "Ege İplik", old,
                cert(DocType.OEKO_TEX, TODAY.plusDays(300), "Ege İplik"));
        assertThat(codes(check(facts(LABEL, other)))).contains(IssueCode.SER_01);
    }

    @Test
    void aCertificateEndingWithinThirtyDaysWarnsAndTheLimitDayCounts() {
        assertThat(codes(check(facts(LABEL, withCertificateUntil(TODAY.plusDays(30)))))).contains(IssueCode.SER_02);
        assertThat(codes(check(facts(LABEL, withCertificateUntil(TODAY.plusDays(31)))))).doesNotContain(IssueCode.SER_02);
        // Valid today is not expired.
        List<IssueCode> today = codes(check(facts(LABEL, withCertificateUntil(TODAY))));
        assertThat(today).contains(IssueCode.SER_02).doesNotContain(IssueCode.SER_01);
        assertThat(codes(check(facts(LABEL, withCertificateUntil(TODAY.minusDays(1)))))).contains(IssueCode.SER_01)
                .doesNotContain(IssueCode.SER_02);
    }

    private static StepFacts withCertificateUntil(LocalDate until) {
        return step(StepType.FABRIC, StepStatus.APPROVED, null, "Demirtaş", cert(DocType.GOTS, until, "Demirtaş"));
    }

    @Test
    void anUnconfirmedCertificateIsNotCountedByTheCertificateRules() {
        DocumentFacts waiting = new DocumentFacts(UUID.randomUUID(), DocType.GOTS, false, TODAY.minusDays(100), "X",
                "gots.pdf");
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED, null, "Ege İplik", waiting);

        List<IssueCode> found = codes(check(facts(LABEL, yarn)));

        assertThat(found).doesNotContain(IssueCode.SER_01, IssueCode.SER_02, IssueCode.SER_03);
        assertThat(found).contains(IssueCode.SER_04, IssueCode.BEL_01);
    }

    // --- SER-03 -----------------------------------------------------------------------------------------------------

    @Test
    void companyNamesAreComparedWithoutCaseDotsAndLegalForms() {
        assertThat(ConsistencyRules.sameCompany("Ege İplik San. A.Ş.", "EGE IPLIK")).isTrue();
        assertThat(ConsistencyRules.sameCompany("Ege Iplik Sanayi ve Ticaret Anonim Şirketi", "ege iplik")).isTrue();
        assertThat(ConsistencyRules.sameCompany("Demirtaş Örme Kumaş Ltd. Şti.", "DEMİRTAŞ ÖRME KUMAŞ")).isTrue();
        assertThat(ConsistencyRules.sameCompany("Uludağ Boya", "ULUDAG BOYA TERBIYE")).isFalse();
        assertThat(ConsistencyRules.sameCompany("Ege Iplik Tekstil", "Ege İplik San. A.Ş.")).isFalse();
        assertThat(ConsistencyRules.sameCompany("A.Ş.", "A.Ş.")).isTrue();
    }

    @Test
    void aCertificateOfAnotherCompanyWarns() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED, null, "Ege İplik San. A.Ş.",
                cert(DocType.GOTS, TODAY.plusDays(200), "Ege Iplik Tekstil"));

        Finding ser = check(facts(LABEL, yarn)).stream().filter(f -> f.code() == IssueCode.SER_03).findFirst()
                .orElseThrow();

        assertThat(ser.severity()).isEqualTo(IssueSeverity.WARNING);
        assertThat(ser.params().holder()).isEqualTo("Ege Iplik Tekstil");
        assertThat(ser.params().supplier()).isEqualTo("Ege İplik San. A.Ş.");
    }

    @Test
    void noHolderOrNoSupplierIsNothingToCompare() {
        StepFacts noSupplier = step(StepType.YARN, StepStatus.APPROVED, null, null,
                cert(DocType.GOTS, TODAY.plusDays(200), "Ege İplik"));
        StepFacts noHolder = step(StepType.FABRIC, StepStatus.APPROVED, null, "Demirtaş",
                cert(DocType.OEKO_TEX, TODAY.plusDays(200), null));

        assertThat(codes(check(facts(LABEL, noSupplier, noHolder)))).doesNotContain(IssueCode.SER_03);
    }

    // --- SER-04 -----------------------------------------------------------------------------------------------------

    @Test
    void anApprovedStepThatShouldHoldACertificateAndDoesNotWarns() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED, null, "A");
        StepFacts dyeing = step(StepType.DYEING, StepStatus.APPROVED, null, "B");
        StepFacts sewing = step(StepType.SEWING, StepStatus.APPROVED, null, "C");
        StepFacts submittedFabric = step(StepType.FABRIC, StepStatus.SUBMITTED, null, "D");

        List<Finding> found = check(facts(LABEL, yarn, dyeing, sewing, submittedFabric));

        assertThat(found).filteredOn(f -> f.code() == IssueCode.SER_04).extracting(Finding::stepId)
                .containsExactlyInAnyOrder(yarn.id(), dyeing.id());
    }

    // --- EKS-01, EKS-02 ---------------------------------------------------------------------------------------------

    @Test
    void aProductWithoutALabelCompositionWarns() {
        assertThat(codes(check(facts(null)))).contains(IssueCode.EKS_01);
        assertThat(codes(check(facts(List.of())))).contains(IssueCode.EKS_01);
        assertThat(codes(check(facts(LABEL)))).doesNotContain(IssueCode.EKS_01);
        assertThat(IssueCode.EKS_01.severity()).isEqualTo(IssueSeverity.WARNING);
    }

    @Test
    void aMissingProductionDateIsInfoAndSaysWhichOne() {
        assertThat(check(new Facts(LABEL, FROM, TO, List.of()))).isEmpty();

        assertThat(only(check(new Facts(LABEL, null, TO, List.of())), IssueCode.EKS_02).params().missing())
                .isEqualTo("FROM");
        assertThat(only(check(new Facts(LABEL, FROM, null, List.of())), IssueCode.EKS_02).params().missing())
                .isEqualTo("TO");
        Finding both = only(check(new Facts(LABEL, null, null, List.of())), IssueCode.EKS_02);
        assertThat(both.params().missing()).isEqualTo("BOTH");
        assertThat(both.severity()).isEqualTo(IssueSeverity.INFO);
    }

    private static Finding only(List<Finding> found, IssueCode code) {
        List<Finding> matching = found.stream().filter(f -> f.code() == code).toList();
        assertThat(matching).hasSize(1);
        return matching.getFirst();
    }

    // --- BEL-01 -----------------------------------------------------------------------------------------------------

    @Test
    void everyDocumentWaitingForConfirmationIsInfo() {
        DocumentFacts a = new DocumentFacts(UUID.randomUUID(), DocType.UNKNOWN, false, null, null, "scan-1.pdf");
        DocumentFacts b = new DocumentFacts(UUID.randomUUID(), DocType.INVOICE, false, null, null, "fatura.pdf");
        StepFacts yarn = step(StepType.YARN, StepStatus.SUBMITTED, null, "A", a, b);

        List<Finding> bel = check(facts(LABEL, yarn)).stream().filter(f -> f.code() == IssueCode.BEL_01).toList();

        assertThat(bel).extracting(Finding::documentId).containsExactlyInAnyOrder(a.id(), b.id());
        assertThat(bel).extracting(f -> f.params().fileName()).containsExactlyInAnyOrder("scan-1.pdf", "fatura.pdf");
        assertThat(bel).allMatch(f -> f.severity() == IssueSeverity.INFO);
    }

    @Test
    void aCleanBatchHasNoFindings() {
        StepFacts yarn = step(StepType.YARN, StepStatus.APPROVED, LABEL, "Ege İplik",
                cert(DocType.GOTS, TODAY.plusDays(200), "Ege İplik"));

        assertThat(check(facts(LABEL, yarn))).isEmpty();
    }

    @Test
    void theCodesCarryTheirSeverityAndTheirText() {
        assertThat(IssueCode.LIF_01.code()).isEqualTo("LIF-01");
        assertThat(IssueCode.ofCode("SER-04")).isEqualTo(IssueCode.SER_04);
        assertThat(List.of(IssueCode.values())).filteredOn(c -> c.severity() == IssueSeverity.ERROR)
                .containsExactly(IssueCode.LIF_01, IssueCode.LIF_02, IssueCode.SER_01);
    }
}
