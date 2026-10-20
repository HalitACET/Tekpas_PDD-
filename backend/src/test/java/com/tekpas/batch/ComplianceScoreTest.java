package com.tekpas.batch;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.batch.ComplianceScore.DocumentFacts;
import com.tekpas.batch.ComplianceScore.ProductFacts;
import com.tekpas.batch.ComplianceScore.StepFacts;
import com.tekpas.batch.dto.ScoreCriterion;
import com.tekpas.batch.dto.ScoreIssue;
import com.tekpas.batch.dto.ScoreResponse;
import com.tekpas.document.DocType;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.supplychain.ChemicalStandard;
import com.tekpas.supplychain.DyeProcess;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;

/** The score rules of docs/m6-plan.md §2, one rule per test; the default chain is complete unless a test breaks it. */
class ComplianceScoreTest {

    static final LocalDate TODAY = LocalDate.of(2026, 10, 20);

    static final List<FiberShare> COTTON = List.of(new FiberShare(Fiber.ORGANIC_COTTON, 100));
    static final ProductFacts PRODUCT = new ProductFacts(COTTON, ProductCategory.T_SHIRT, LocalDate.of(2026, 9, 1),
            LocalDate.of(2026, 9, 10));

    /** A step with its required fields filled (what the supplier must submit). */
    static StepData filled(StepType type) {
        return switch (type) {
            case FIBER -> new StepData(Fiber.ORGANIC_COTTON, "TR", null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null);
            case YARN -> new StepData(null, "TR", null, null, null, COTTON, null, null, null, null, null, null, null,
                    null, null, null, null, null, null);
            case FABRIC -> new StepData(null, null, null, null, null, COTTON, null, null, null, null, null, null,
                    "Süprem", null, null, null, null, null, null);
            case DYEING -> new StepData(null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, DyeProcess.REACTIVE, null, null, List.of(ChemicalStandard.ZDHC_MRSL), null);
            case SEWING -> new StepData(null, "TR", null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null);
            default -> StepData.EMPTY;
        };
    }

    static DocumentFacts cert(DocType type, @Nullable String until) {
        return new DocumentFacts(type, true, until == null ? null : LocalDate.parse(until));
    }

    static StepFacts step(StepType type, StepStatus status, StepData data, DocumentFacts... docs) {
        return new StepFacts(UUID.randomUUID(), type, status, data, List.of(docs));
    }

    static StepFacts approved(StepType type, DocumentFacts... docs) {
        return step(type, StepStatus.APPROVED, filled(type), docs);
    }

    /** The default chain, all approved, with a valid GOTS on the yarn, fabric and dyeing steps. */
    static List<StepFacts> fullChain() {
        return List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                approved(StepType.FABRIC, cert(DocType.OEKO_TEX, "2027-01-01")),
                approved(StepType.DYEING, cert(DocType.OEKO_TEX, "2027-02-01")), approved(StepType.SEWING));
    }

    static ScoreCriterion criterion(ScoreResponse r, CriterionCode code) {
        return r.criteria().stream().filter(c -> c.code() == code).findFirst().orElseThrow();
    }

    static List<ScoreIssueCode> codes(List<ScoreIssue> issues) {
        return issues.stream().map(ScoreIssue::code).toList();
    }

    @Test
    void aCompleteBatchScoresAHundredAndIsPublishable() {
        ScoreResponse r = ComplianceScore.compute(fullChain(), PRODUCT, TODAY);

        assertThat(r.score()).isEqualTo(100);
        assertThat(r.threshold()).isEqualTo(90);
        assertThat(r.publishable()).isTrue();
        assertThat(r.blockers()).isEmpty();
        assertThat(r.criteria()).extracting(ScoreCriterion::code).containsExactly(CriterionCode.STEPS_APPROVED,
                CriterionCode.REQUIRED_FIELDS, CriterionCode.VALID_CERTIFICATES);
        assertThat(r.criteria()).extracting(ScoreCriterion::possible).containsExactly(50, 30, 20);
    }

    @Test
    void theCriteriaAddUpToTheScore() {
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                step(StepType.FABRIC, StepStatus.SUBMITTED, StepData.EMPTY), approved(StepType.DYEING),
                approved(StepType.SEWING));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(r.criteria().stream().mapToInt(ScoreCriterion::earned).sum()).isEqualTo(r.score());
    }

    @Test
    void twoOfThreeCertificatesGiveThirteenPointsAndStillPublish() {
        // docs/m6-plan.md §2 example: 50 + 30 + 13 = 93.
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                approved(StepType.FABRIC, cert(DocType.OEKO_TEX, "2027-01-01")), approved(StepType.DYEING),
                approved(StepType.SEWING));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(criterion(r, CriterionCode.VALID_CERTIFICATES).earned()).isEqualTo(13);
        assertThat(r.score()).isEqualTo(93);
        assertThat(r.publishable()).isTrue();
    }

    @Test
    void oneOfThreeCertificatesStaysUnderTheThreshold() {
        // 50 + 30 + 6 = 86: in practice the threshold asks for two valid certificates.
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                approved(StepType.FABRIC), approved(StepType.DYEING), approved(StepType.SEWING));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(r.score()).isEqualTo(86);
        assertThat(r.publishable()).isFalse();
        assertThat(codes(r.blockers())).containsExactly(ScoreIssueCode.SCORE_BELOW_THRESHOLD);
    }

    @Test
    void ninetyPassesAndEightyEightDoesNot() {
        // Everything approved and three valid certificates (50 + 20), but only the dates of the product side: 10 of 15.
        ProductFacts datesOnly = new ProductFacts(null, null, LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 10));
        ScoreResponse ninety = ComplianceScore.compute(fullChain(), datesOnly, TODAY);
        assertThat(ninety.score()).isEqualTo(90);
        assertThat(ninety.publishable()).isTrue();

        // Fibres and category set but no dates (10 of 15), two of three certificates (13): 50 + 25 + 13 = 88.
        List<StepFacts> twoCerts = List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                approved(StepType.FABRIC, cert(DocType.OEKO_TEX, "2027-01-01")), approved(StepType.DYEING),
                approved(StepType.SEWING));
        ProductFacts noDates = new ProductFacts(COTTON, ProductCategory.T_SHIRT, null, null);
        ScoreResponse eightyEight = ComplianceScore.compute(twoCerts, noDates, TODAY);
        assertThat(eightyEight.score()).isEqualTo(88);
        assertThat(codes(eightyEight.blockers())).containsExactly(ScoreIssueCode.SCORE_BELOW_THRESHOLD);
    }

    @Test
    void anUnapprovedStepBlocksEvenWhenTheScoreIsHigh() {
        // 100 steps' worth is not possible here, but a sewing step that is only submitted with everything else
        // perfect scores 90 and must still block (decision 1).
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN, cert(DocType.GOTS, "2027-03-13")),
                approved(StepType.FABRIC, cert(DocType.OEKO_TEX, "2027-01-01")),
                approved(StepType.DYEING, cert(DocType.OEKO_TEX, "2027-02-01")),
                step(StepType.SEWING, StepStatus.SUBMITTED, filled(StepType.SEWING)));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(r.score()).isGreaterThanOrEqualTo(90);
        assertThat(r.publishable()).isFalse();
        assertThat(r.blockers()).singleElement().satisfies(b -> {
            assertThat(b.code()).isEqualTo(ScoreIssueCode.STEP_NOT_APPROVED);
            assertThat(b.stepType()).isEqualTo(StepType.SEWING);
            assertThat(b.stepId()).isEqualTo(chain.get(4).id());
        });
    }

    @Test
    void noChainScoresOnlyWhatTheProductGivesAndBlocks() {
        ScoreResponse r = ComplianceScore.compute(List.of(), PRODUCT, TODAY);

        assertThat(r.score()).isEqualTo(15);
        assertThat(criterion(r, CriterionCode.STEPS_APPROVED).earned()).isZero();
        assertThat(criterion(r, CriterionCode.VALID_CERTIFICATES).earned()).isZero();
        assertThat(codes(r.blockers())).containsExactly(ScoreIssueCode.NO_CHAIN, ScoreIssueCode.SCORE_BELOW_THRESHOLD);
    }

    @Test
    void productAndBatchFieldsAreFiveEach() {
        ProductFacts noDates = new ProductFacts(COTTON, ProductCategory.T_SHIRT, null, LocalDate.of(2026, 9, 10));
        ProductFacts noFibers = new ProductFacts(null, ProductCategory.T_SHIRT, LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 10));
        ProductFacts badTotal = new ProductFacts(List.of(new FiberShare(Fiber.COTTON, 60)), ProductCategory.T_SHIRT,
                LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 10));

        assertThat(ComplianceScore.compute(fullChain(), noDates, TODAY).score()).isEqualTo(95);
        assertThat(ComplianceScore.compute(fullChain(), noFibers, TODAY).score()).isEqualTo(95);
        assertThat(ComplianceScore.compute(fullChain(), badTotal, TODAY).score()).isEqualTo(95);
    }

    @Test
    void stepFieldsAreSharedByTheStepsThatHaveRequiredFields() {
        // FIBER needs 2 fields, SEWING 1; ACCESSORY has none and is left out of the average.
        StepFacts fiberHalf = step(StepType.FIBER, StepStatus.APPROVED, new StepData(Fiber.COTTON, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null));
        StepFacts accessory = approved(StepType.ACCESSORY);
        List<StepFacts> chain = List.of(fiberHalf, approved(StepType.SEWING), accessory);

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        // shares: FIBER 1/2, SEWING 1 → average 3/4 → 15 * 3/4 = 11; product part 15.
        assertThat(criterion(r, CriterionCode.REQUIRED_FIELDS).earned()).isEqualTo(26);
        assertThat(criterion(r, CriterionCode.REQUIRED_FIELDS).items()).anySatisfy(i -> {
            assertThat(i.code()).isEqualTo(ScoreItemCode.STEP_FIELDS);
            assertThat(i.stepType()).isEqualTo(StepType.FIBER);
            assertThat(i.ok()).isFalse();
            assertThat(i.missing()).containsExactly("originCountry");
        });
    }

    @Test
    void anUnconfirmedDocumentEarnsNothing() {
        DocumentFacts unconfirmed = new DocumentFacts(DocType.GOTS, false, LocalDate.of(2027, 3, 13));
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN, unconfirmed),
                approved(StepType.FABRIC), approved(StepType.DYEING), approved(StepType.SEWING));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(criterion(r, CriterionCode.VALID_CERTIFICATES).earned()).isZero();
        assertThat(r.warnings()).singleElement().satisfies(w -> {
            assertThat(w.code()).isEqualTo(ScoreIssueCode.UNREVIEWED_DOCUMENTS);
            assertThat(w.count()).isEqualTo(1);
        });
    }

    @Test
    void aTechnicalSheetIsNotACertificate() {
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.YARN,
                cert(DocType.TECH_SHEET, "2027-03-13")), approved(StepType.FABRIC), approved(StepType.DYEING),
                approved(StepType.SEWING));

        assertThat(criterion(ComplianceScore.compute(chain, PRODUCT, TODAY), CriterionCode.VALID_CERTIFICATES).earned())
                .isZero();
    }

    @Test
    void aCertificateIsValidThroughItsLastDay() {
        List<StepFacts> today = List.of(approved(StepType.YARN, cert(DocType.GOTS, "2026-10-20")));
        List<StepFacts> yesterday = List.of(approved(StepType.YARN, cert(DocType.GOTS, "2026-10-19")));

        ScoreResponse valid = ComplianceScore.compute(today, PRODUCT, TODAY);
        ScoreResponse expired = ComplianceScore.compute(yesterday, PRODUCT, TODAY);

        assertThat(criterion(valid, CriterionCode.VALID_CERTIFICATES).earned()).isEqualTo(20);
        assertThat(codes(valid.blockers())).doesNotContain(ScoreIssueCode.CERTIFICATE_EXPIRED);
        assertThat(criterion(expired, CriterionCode.VALID_CERTIFICATES).earned()).isZero();
        assertThat(expired.blockers()).anySatisfy(b -> {
            assertThat(b.code()).isEqualTo(ScoreIssueCode.CERTIFICATE_EXPIRED);
            assertThat(b.docType()).isEqualTo(DocType.GOTS);
            assertThat(b.validUntil()).isEqualTo(LocalDate.of(2026, 10, 19));
        });
    }

    @Test
    void aRenewalReplacesTheExpiredCertificateOfTheSameType() {
        List<StepFacts> renewed = List.of(approved(StepType.YARN, cert(DocType.GOTS, "2025-03-13"),
                cert(DocType.GOTS, "2027-03-13")));
        List<StepFacts> otherType = List.of(approved(StepType.YARN, cert(DocType.GOTS, "2025-03-13"),
                cert(DocType.OEKO_TEX, "2027-03-13")));

        assertThat(codes(ComplianceScore.compute(renewed, PRODUCT, TODAY).blockers()))
                .doesNotContain(ScoreIssueCode.CERTIFICATE_EXPIRED);
        // An expired GOTS is not made good by a valid OEKO-TEX.
        assertThat(codes(ComplianceScore.compute(otherType, PRODUCT, TODAY).blockers()))
                .contains(ScoreIssueCode.CERTIFICATE_EXPIRED);
    }

    @Test
    void aCertificateEndingWithinThirtyDaysIsAWarningNotABlocker() {
        List<StepFacts> chain = List.of(approved(StepType.YARN, cert(DocType.GOTS, "2026-11-19")),
                approved(StepType.FABRIC, cert(DocType.OEKO_TEX, "2026-11-20")));

        ScoreResponse r = ComplianceScore.compute(chain, PRODUCT, TODAY);

        assertThat(r.warnings()).singleElement().satisfies(w -> {
            assertThat(w.code()).isEqualTo(ScoreIssueCode.CERTIFICATE_EXPIRING);
            assertThat(w.docType()).isEqualTo(DocType.GOTS);
        });
        assertThat(codes(r.blockers())).doesNotContain(ScoreIssueCode.CERTIFICATE_EXPIRED);
    }

    @Test
    void aChainThatExpectsNoCertificateHasNothingToMiss() {
        List<StepFacts> chain = List.of(approved(StepType.FIBER), approved(StepType.SEWING));

        assertThat(criterion(ComplianceScore.compute(chain, PRODUCT, TODAY), CriterionCode.VALID_CERTIFICATES).earned())
                .isEqualTo(20);
    }

    @Test
    void stepSharesAreAveragedExactly() {
        // Three steps with one of two required fields filled each: the shares add up to 3/2, the average is 1/2.
        StepData half = new StepData(Fiber.COTTON, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
        List<StepFacts> chain = List.of(step(StepType.FIBER, StepStatus.APPROVED, half),
                step(StepType.FIBER, StepStatus.APPROVED, half), step(StepType.FIBER, StepStatus.APPROVED, half));

        // average share 1/2 → 15 / 2 = 7 (floor), product part 15.
        assertThat(criterion(ComplianceScore.compute(chain, PRODUCT, TODAY), CriterionCode.REQUIRED_FIELDS).earned())
                .isEqualTo(22);
    }
}
