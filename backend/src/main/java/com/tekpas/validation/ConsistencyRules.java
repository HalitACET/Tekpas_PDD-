package com.tekpas.validation;

import com.tekpas.batch.ComplianceScore;
import com.tekpas.document.DocType;
import com.tekpas.document.reading.Folding;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;

/**
 * The rule checks of a batch, a pure function (docs/m7-plan.md §2): no database, no clock of its own. It says what is
 * wrong now; {@link IssueSync} makes the stored issues say the same.
 */
public final class ConsistencyRules {

    /** The label and a step's composition may differ by this many percentage points per fibre (EU 1007/2011). */
    public static final int LIF_TOLERANCE = 3;
    public static final int EXPIRING_DAYS = ComplianceScore.EXPIRING_DAYS;

    /** Words of a company's legal form and trade, left out when two names are compared ("Ege İplik San. A.Ş."). */
    private static final Set<String> NAME_NOISE = Set.of("a", "s", "as", "ltd", "sti", "san", "tic", "ve", "sanayi",
            "ticaret", "limited", "sirketi", "anonim", "inc", "gmbh", "ag", "co", "corp", "llc");

    /** A document of a step, as far as the rules care. */
    public record DocumentFacts(UUID id, DocType type, boolean confirmed, @Nullable LocalDate validUntil,
            @Nullable String holder, String fileName) {
    }

    /** A step of the chain; {@code composition} is what the supplier declared (null for steps that do not). */
    public record StepFacts(UUID id, StepType type, StepStatus status, @Nullable List<FiberShare> composition,
            @Nullable String supplierName, List<DocumentFacts> documents) {
    }

    /** What the product's label and the batch declare, and the chain. */
    public record Facts(@Nullable List<FiberShare> label, @Nullable LocalDate producedFrom,
            @Nullable LocalDate producedTo, List<StepFacts> steps) {
    }

    private ConsistencyRules() {
    }

    public static List<Finding> check(Facts facts, LocalDate today) {
        List<Finding> found = new ArrayList<>();
        fibres(facts, found);
        certificates(facts, today, found);
        missing(facts, found);
        unconfirmed(facts, found);
        return found;
    }

    // --- LIF-01, LIF-02 ---------------------------------------------------------------------------------------------

    private static void fibres(Facts facts, List<Finding> found) {
        List<FiberShare> label = facts.label();
        boolean labelUsable = false;
        if (label != null && !label.isEmpty()) {
            int total = total(label);
            if (total == 100) {
                labelUsable = true;
            } else {
                found.add(finding(IssueCode.LIF_02, null, null,
                        new IssueParams(label, null, null, total, null, null, null, null, null, null), summary(label),
                        "Fibre composition on the label adds up to " + total + ", not 100: " + describe(label)));
            }
        }
        // A step that has been submitted or approved has data a person can compare; a pending one has none.
        List<StepFacts> declared = new ArrayList<>();
        for (StepFacts step : facts.steps()) {
            List<FiberShare> composition = step.composition();
            if (composition == null || composition.isEmpty() || !(step.status() == StepStatus.SUBMITTED
                    || step.status() == StepStatus.APPROVED)) {
                continue;
            }
            int total = total(composition);
            if (total != 100) {
                found.add(finding(IssueCode.LIF_02, step.id(), null,
                        new IssueParams(null, composition, null, total, null, null, null, null, null, null),
                        summary(composition), step.type() + " step declares a composition that adds up to " + total
                                + ", not 100: " + describe(composition)));
                continue;
            }
            declared.add(step);
        }
        if (!labelUsable) {
            return;
        }
        for (StepFacts step : referenceSteps(declared)) {
            List<FiberShare> composition = step.composition();
            List<Fiber> differing = differing(label, composition);
            if (!differing.isEmpty()) {
                found.add(finding(IssueCode.LIF_01, step.id(), null,
                        new IssueParams(label, composition, differing, null, null, null, null, null, null, null),
                        summary(label) + "/" + summary(composition), "Label composition " + describe(label)
                                + " differs from the " + step.type() + " step's " + describe(composition)));
            }
        }
    }

    /**
     * The steps the label is compared with. The fabric is what the label describes, so fabric steps win; without one
     * the yarn stands in, but only a single yarn (a blend spun from several yarns has no one composition to compare).
     */
    private static List<StepFacts> referenceSteps(List<StepFacts> declared) {
        List<StepFacts> fabrics = declared.stream().filter(s -> s.type() == StepType.FABRIC).toList();
        if (!fabrics.isEmpty()) {
            return fabrics;
        }
        List<StepFacts> yarns = declared.stream().filter(s -> s.type() == StepType.YARN).toList();
        return yarns.size() == 1 ? yarns : List.of();
    }

    /** The fibres whose share differs by more than the tolerance, or that only one of the two lists has. */
    static List<Fiber> differing(List<FiberShare> label, List<FiberShare> declared) {
        Map<Fiber, Integer> a = shares(label);
        Map<Fiber, Integer> b = shares(declared);
        List<Fiber> result = new ArrayList<>();
        for (Fiber fiber : Fiber.values()) {
            Integer left = a.get(fiber);
            Integer right = b.get(fiber);
            if (left == null && right == null) {
                continue;
            }
            if (left == null || right == null || Math.abs(left - right) > LIF_TOLERANCE) {
                result.add(fiber);
            }
        }
        return result;
    }

    // --- SER-01 .. SER-04 -------------------------------------------------------------------------------------------

    private static void certificates(Facts facts, LocalDate today, List<Finding> found) {
        for (StepFacts step : facts.steps()) {
            // Per type, the confirmed certificate that ends last: a renewal replaces the expired one (same as the score).
            Map<DocType, DocumentFacts> latest = new LinkedHashMap<>();
            boolean anyConfirmed = false;
            for (DocumentFacts doc : step.documents()) {
                if (!doc.confirmed() || !doc.type().isCertificate()) {
                    continue;
                }
                anyConfirmed = true;
                if (doc.validUntil() != null) {
                    latest.merge(doc.type(), doc, (x, y) -> later(x, y));
                }
                holder(step, doc, found);
            }
            for (DocumentFacts doc : latest.values()) {
                LocalDate until = doc.validUntil();
                IssueParams params = IssueParams.ofDocument(doc.type(), until);
                if (until.isBefore(today)) {
                    found.add(finding(IssueCode.SER_01, step.id(), doc.id(), params, until.toString(),
                            doc.type() + " certificate expired on " + until));
                } else if (!until.isAfter(today.plusDays(EXPIRING_DAYS))) {
                    found.add(finding(IssueCode.SER_02, step.id(), doc.id(), params, until.toString(),
                            doc.type() + " certificate expires on " + until));
                }
            }
            if (!anyConfirmed && step.status() == StepStatus.APPROVED && ComplianceScore.expectsCertificate(step.type())) {
                found.add(finding(IssueCode.SER_04, step.id(), null, IssueParams.EMPTY, "",
                        step.type() + " step is approved but holds no confirmed certificate"));
            }
        }
    }

    private static DocumentFacts later(DocumentFacts x, DocumentFacts y) {
        int byDate = x.validUntil().compareTo(y.validUntil());
        if (byDate != 0) {
            return byDate > 0 ? x : y;
        }
        // Same end of validity: the same one every run, whatever the order the documents came in.
        return x.id().compareTo(y.id()) <= 0 ? x : y;
    }

    private static void holder(StepFacts step, DocumentFacts doc, List<Finding> found) {
        String holder = doc.holder();
        String supplier = step.supplierName();
        if (holder == null || holder.isBlank() || supplier == null || supplier.isBlank() || sameCompany(holder, supplier)) {
            return;
        }
        found.add(finding(IssueCode.SER_03, step.id(), doc.id(),
                new IssueParams(null, null, null, null, doc.type(), doc.validUntil(), holder, supplier, null, null),
                Folding.fold(holder) + "/" + Folding.fold(supplier),
                doc.type() + " certificate holder \"" + holder + "\" differs from the supplier \"" + supplier + "\""));
    }

    /**
     * Whether two names are the same company: letters and digits only, case and Turkish dots ignored, and the words of
     * a legal form ("A.Ş.", "Ltd. Şti.", "San.", "Tic.") left out. "Ege İplik San. A.Ş." is "EGE IPLIK"; "Ege Iplik
     * Tekstil" is another name.
     */
    static boolean sameCompany(String a, String b) {
        return words(a).equals(words(b));
    }

    private static Set<String> words(String name) {
        Set<String> all = new TreeSet<>();
        StringBuilder word = new StringBuilder();
        for (char c : Folding.fold(name).toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                word.append(c);
            } else if (!word.isEmpty()) {
                all.add(word.toString());
                word.setLength(0);
            }
        }
        if (!word.isEmpty()) {
            all.add(word.toString());
        }
        Set<String> meaningful = new TreeSet<>(all);
        meaningful.removeAll(NAME_NOISE);
        // A name made only of such words keeps them: two of those are still compared.
        return meaningful.isEmpty() ? all : meaningful;
    }

    // --- EKS-01, EKS-02 ---------------------------------------------------------------------------------------------

    private static void missing(Facts facts, List<Finding> found) {
        if (facts.label() == null || facts.label().isEmpty()) {
            found.add(finding(IssueCode.EKS_01, null, null, IssueParams.EMPTY, "",
                    "The product has no fibre composition on its label"));
        }
        String which = facts.producedFrom() == null ? (facts.producedTo() == null ? "BOTH" : "FROM")
                : (facts.producedTo() == null ? "TO" : null);
        if (which != null) {
            found.add(finding(IssueCode.EKS_02, null, null,
                    new IssueParams(null, null, null, null, null, null, null, null, null, which), which,
                    "Production date missing: " + which));
        }
    }

    // --- BEL-01 -----------------------------------------------------------------------------------------------------

    private static void unconfirmed(Facts facts, List<Finding> found) {
        for (StepFacts step : facts.steps()) {
            for (DocumentFacts doc : step.documents()) {
                if (!doc.confirmed()) {
                    found.add(finding(IssueCode.BEL_01, step.id(), doc.id(),
                            new IssueParams(null, null, null, null, doc.type(), null, null, null, doc.fileName(), null),
                            "", "Document \"" + doc.fileName() + "\" waits for a person's confirmation"));
                }
            }
        }
    }

    // --- helpers ----------------------------------------------------------------------------------------------------

    private static Finding finding(IssueCode code, @Nullable UUID stepId, @Nullable UUID documentId, IssueParams params,
            String data, String message) {
        return new Finding(code, stepId, documentId, params, fingerprint(code, stepId, documentId, data), message);
    }

    /** "LIF-01:step:document:digest": the same finding again has the same one (the AI check uses it too). */
    static String fingerprint(IssueCode code, @Nullable UUID stepId, @Nullable UUID documentId, String data) {
        return code.code() + ":" + (stepId == null ? "-" : stepId) + ":" + (documentId == null ? "-" : documentId)
                + ":" + digest(data);
    }

    private static int total(List<FiberShare> composition) {
        return composition.stream().mapToInt(FiberShare::percent).sum();
    }

    /** Percent per fibre; a fibre listed twice counts once with the sum. */
    private static Map<Fiber, Integer> shares(List<FiberShare> composition) {
        Map<Fiber, Integer> result = new EnumMap<>(Fiber.class);
        for (FiberShare share : composition) {
            result.merge(share.fiber(), share.percent(), Integer::sum);
        }
        return result;
    }

    /** "COTTON=95,ELASTANE=5": the same for the same data whatever the order of the lines. */
    private static String summary(List<FiberShare> composition) {
        return shares(composition).entrySet().stream().map(e -> e.getKey() + "=" + e.getValue())
                .collect(Collectors.joining(","));
    }

    private static String describe(List<FiberShare> composition) {
        return composition.stream().sorted(Comparator.comparing(FiberShare::fiber))
                .map(s -> s.percent() + "% " + s.fiber()).collect(Collectors.joining(", "));
    }

    /** Twelve hex digits of SHA-256: short enough for the fingerprint column however long the data is. */
    private static String digest(String data) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(data.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 6);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is always available", e);
        }
    }
}
