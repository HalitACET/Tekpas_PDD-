package com.tekpas.batch;

import com.tekpas.batch.dto.ScoreCriterion;
import com.tekpas.batch.dto.ScoreIssue;
import com.tekpas.batch.dto.ScoreItem;
import com.tekpas.batch.dto.ScoreResponse;
import com.tekpas.document.DocType;
import com.tekpas.product.FiberShare;
import com.tekpas.product.ProductCategory;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The compliance score of a batch, a pure function (docs/m6-plan.md §2): no database, no clock of its own, no AI.
 * Three criteria, each rounded down to whole points; the score is their sum, so the parts the panel shows add up.
 *
 * <ul>
 * <li>{@code STEPS_APPROVED} 50: every step of the chain counts the same, approved steps earn their share.
 * <li>{@code REQUIRED_FIELDS} 30: 15 for the steps (each step's share of filled required fields, steps count the
 * same) and 15 for the product and batch (fibre composition, category, both production dates).
 * <li>{@code VALID_CERTIFICATES} 20: the steps that are expected to hold a certificate (yarn, fabric, dyeing) share
 * it; a step earns its share with a <b>confirmed</b> certificate that has not expired. An unconfirmed document
 * counts for nothing (CLAUDE.md rule 5).
 * </ul>
 *
 * Blockers stop publishing whatever the score: no chain, a step that is not approved, an expired confirmed
 * certificate with no valid one of the same type in the step, a score under the threshold.
 */
public final class ComplianceScore {

    public static final int THRESHOLD = 90;
    static final int STEPS_POINTS = 50;
    static final int FIELDS_POINTS = 30;
    static final int CERTIFICATE_POINTS = 20;
    /** Half of REQUIRED_FIELDS comes from the steps, half from the product and batch. */
    private static final int FIELDS_STEP_POINTS = FIELDS_POINTS / 2;
    private static final int FIELDS_PRODUCT_POINTS = FIELDS_POINTS - FIELDS_STEP_POINTS;
    /** The steps whose suppliers are expected to hold certificates (docs/m6-plan.md §9 decision 2). */
    private static final Set<StepType> CERTIFICATE_STEPS = EnumSet.of(StepType.YARN, StepType.FABRIC, StepType.DYEING);
    /** A confirmed certificate ending within this many days is expiring (SER-02 uses the same number). */
    public static final int EXPIRING_DAYS = 30;

    /** A document of a step, as far as the score cares. */
    public record DocumentFacts(DocType type, boolean confirmed, @Nullable LocalDate validUntil) {
    }

    /** A step of the chain, in chain order. */
    public record StepFacts(UUID id, StepType type, StepStatus status, StepData data, List<DocumentFacts> documents) {
    }

    /** What the product and the batch declare. */
    public record ProductFacts(@Nullable List<FiberShare> fibers, @Nullable ProductCategory category,
            @Nullable LocalDate producedFrom, @Nullable LocalDate producedTo) {
    }

    private ComplianceScore() {
    }

    /** Whether a supplier of this step is expected to hold a certificate (SER-04 uses the same set). */
    public static boolean expectsCertificate(StepType type) {
        return CERTIFICATE_STEPS.contains(type);
    }

    public static ScoreResponse compute(List<StepFacts> steps, ProductFacts product, LocalDate today) {
        List<ScoreItem> approvedItems = new ArrayList<>();
        int approved = 0;
        for (StepFacts step : steps) {
            boolean ok = step.status() == StepStatus.APPROVED;
            approved += ok ? 1 : 0;
            approvedItems.add(new ScoreItem(ScoreItemCode.STEP_APPROVED, step.id(), step.type(), ok, null));
        }
        int stepPoints = steps.isEmpty() ? 0 : STEPS_POINTS * approved / steps.size();

        int fieldPoints = fieldPoints(steps, product);
        List<ScoreItem> fieldItems = fieldItems(steps, product);

        Certificates certificates = Certificates.of(steps, today);
        int expected = (int) steps.stream().filter(s -> CERTIFICATE_STEPS.contains(s.type())).count();
        int certificatePoints;
        if (steps.isEmpty()) {
            certificatePoints = 0;
        } else if (expected == 0) {
            // A chain that expects no certificate has nothing to miss.
            certificatePoints = CERTIFICATE_POINTS;
        } else {
            certificatePoints = CERTIFICATE_POINTS * certificates.stepsWithValid(steps) / expected;
        }

        int score = stepPoints + fieldPoints + certificatePoints;
        List<ScoreIssue> blockers = new ArrayList<>();
        if (steps.isEmpty()) {
            blockers.add(issue(ScoreIssueCode.NO_CHAIN, null, null, null, null));
        }
        for (StepFacts step : steps) {
            if (step.status() != StepStatus.APPROVED) {
                blockers.add(issue(ScoreIssueCode.STEP_NOT_APPROVED, step, null, null, null));
            }
        }
        blockers.addAll(certificates.expired);
        if (score < THRESHOLD) {
            blockers.add(issue(ScoreIssueCode.SCORE_BELOW_THRESHOLD, null, null, null, null));
        }

        List<ScoreIssue> warnings = new ArrayList<>();
        int unreviewed = (int) steps.stream().flatMap(s -> s.documents().stream()).filter(d -> !d.confirmed()).count();
        if (unreviewed > 0) {
            warnings.add(issue(ScoreIssueCode.UNREVIEWED_DOCUMENTS, null, null, null, unreviewed));
        }
        warnings.addAll(certificates.expiring);

        List<ScoreCriterion> criteria = List.of(
                new ScoreCriterion(CriterionCode.STEPS_APPROVED, stepPoints, STEPS_POINTS, approvedItems),
                new ScoreCriterion(CriterionCode.REQUIRED_FIELDS, fieldPoints, FIELDS_POINTS, fieldItems),
                new ScoreCriterion(CriterionCode.VALID_CERTIFICATES, certificatePoints, CERTIFICATE_POINTS,
                        certificates.items));
        return new ScoreResponse(score, THRESHOLD, blockers.isEmpty(), criteria, blockers, warnings);
    }

    private static int fieldPoints(List<StepFacts> steps, ProductFacts product) {
        // Each step's share is (required - missing) / required; the shares are added as exact fractions so that
        // three thirds make one whole, not 0.999….
        long num = 0;
        long den = 1;
        int counted = 0;
        for (StepFacts step : steps) {
            int required = StepData.requiredFor(step.type()).size();
            if (required == 0) {
                continue;
            }
            int filled = required - step.data().missingFor(step.type()).size();
            num = num * required + (long) filled * den;
            den = den * required;
            long g = gcd(num, den);
            num /= g;
            den /= g;
            counted++;
        }
        int fromSteps = counted == 0 ? 0 : (int) (FIELDS_STEP_POINTS * num / (den * counted));
        int productOk = (productFibersOk(product) ? 1 : 0) + (product.category() != null ? 1 : 0)
                + (product.producedFrom() != null && product.producedTo() != null ? 1 : 0);
        return fromSteps + FIELDS_PRODUCT_POINTS * productOk / 3;
    }

    private static List<ScoreItem> fieldItems(List<StepFacts> steps, ProductFacts product) {
        List<ScoreItem> items = new ArrayList<>();
        for (StepFacts step : steps) {
            if (StepData.requiredFor(step.type()).isEmpty()) {
                continue;
            }
            List<String> missing = step.data().missingFor(step.type());
            items.add(new ScoreItem(ScoreItemCode.STEP_FIELDS, step.id(), step.type(), missing.isEmpty(), missing));
        }
        items.add(new ScoreItem(ScoreItemCode.PRODUCT_FIBERS, null, null, productFibersOk(product), null));
        items.add(new ScoreItem(ScoreItemCode.PRODUCT_CATEGORY, null, null, product.category() != null, null));
        items.add(new ScoreItem(ScoreItemCode.BATCH_DATES, null, null,
                product.producedFrom() != null && product.producedTo() != null, null));
        return items;
    }

    private static boolean productFibersOk(ProductFacts product) {
        List<FiberShare> fibers = product.fibers();
        return fibers != null && !fibers.isEmpty() && fibers.stream().mapToInt(FiberShare::percent).sum() == 100;
    }

    private static long gcd(long a, long b) {
        return b == 0 ? Math.max(a, 1) : gcd(b, a % b);
    }

    private static ScoreIssue issue(ScoreIssueCode code, @Nullable StepFacts step, @Nullable DocType docType,
            @Nullable LocalDate validUntil, @Nullable Integer count) {
        return new ScoreIssue(code, step == null ? null : step.id(), step == null ? null : step.type(), docType,
                validUntil, count);
    }

    /** What the confirmed certificates say: which steps hold a valid one, which are expired, which expire soon. */
    private static final class Certificates {
        final List<ScoreItem> items = new ArrayList<>();
        final List<ScoreIssue> expired = new ArrayList<>();
        final List<ScoreIssue> expiring = new ArrayList<>();
        private final Map<UUID, Boolean> validByStep = new LinkedHashMap<>();

        static Certificates of(List<StepFacts> steps, LocalDate today) {
            Certificates result = new Certificates();
            for (StepFacts step : steps) {
                // Per type: the latest end of validity among the step's confirmed certificates of that type.
                Map<DocType, LocalDate> latest = new LinkedHashMap<>();
                for (DocumentFacts doc : step.documents()) {
                    if (doc.confirmed() && doc.type().isCertificate() && doc.validUntil() != null) {
                        latest.merge(doc.type(), doc.validUntil(), (a, b) -> a.isAfter(b) ? a : b);
                    }
                }
                boolean anyValid = false;
                for (Map.Entry<DocType, LocalDate> e : latest.entrySet()) {
                    LocalDate until = e.getValue();
                    if (until.isBefore(today)) {
                        // An expired type is only a blocker when the step has no valid certificate of that type
                        // (a renewal replaces it): `latest` is the latest end, so that is exactly this case.
                        result.expired.add(issue(ScoreIssueCode.CERTIFICATE_EXPIRED, step, e.getKey(), until, null));
                    } else {
                        anyValid = true;
                        if (!until.isAfter(today.plusDays(EXPIRING_DAYS))) {
                            result.expiring.add(
                                    issue(ScoreIssueCode.CERTIFICATE_EXPIRING, step, e.getKey(), until, null));
                        }
                    }
                }
                result.validByStep.put(step.id(), anyValid);
                if (CERTIFICATE_STEPS.contains(step.type())) {
                    result.items.add(new ScoreItem(ScoreItemCode.STEP_CERTIFICATE, step.id(), step.type(), anyValid,
                            null));
                }
            }
            return result;
        }

        int stepsWithValid(List<StepFacts> steps) {
            return (int) steps.stream().filter(s -> CERTIFICATE_STEPS.contains(s.type()))
                    .filter(s -> validByStep.getOrDefault(s.id(), false)).count();
        }
    }
}
