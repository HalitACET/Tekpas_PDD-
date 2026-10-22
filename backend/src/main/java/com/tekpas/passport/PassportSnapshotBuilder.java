package com.tekpas.passport;

import com.tekpas.batch.Batch;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.document.Document;
import com.tekpas.document.DocumentRepository;
import com.tekpas.passport.snapshot.PassportSnapshot;
import com.tekpas.passport.snapshot.SnapshotActor;
import com.tekpas.passport.snapshot.SnapshotBatch;
import com.tekpas.passport.snapshot.SnapshotCertificate;
import com.tekpas.passport.snapshot.SnapshotManufacturer;
import com.tekpas.passport.snapshot.SnapshotPassport;
import com.tekpas.passport.snapshot.SnapshotProduct;
import com.tekpas.passport.snapshot.SnapshotStep;
import com.tekpas.passport.snapshot.SnapshotStepData;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.StepData;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Builds what a passport freezes from the batch's current state (docs/m6-plan.md §3.2), for publishing and for the
 * preview. Only a whitelist of the data leaves: opaque keys instead of ids, the public subset of a step's data,
 * confirmed certificates (rule 5) that are valid on the day, no quantities, no phone numbers, no names of people.
 * Every lookup is filtered by the company.
 */
@Component
class PassportSnapshotBuilder {

    /** The snapshot, and whether every step it shows was approved (a published one must be). */
    record Built(PassportSnapshot snapshot, boolean allApproved) {
    }

    private static final Comparator<SupplyStep> CHAIN_ORDER = Comparator.comparing(SupplyStep::getStepType)
            .thenComparingInt(SupplyStep::getSortOrder).thenComparing(SupplyStep::getCreatedAt)
            .thenComparing(SupplyStep::getId);

    private final SupplyStepRepository steps;
    private final ProductRepository products;
    private final CompanyRepository companies;
    private final DocumentRepository documents;
    private final NamedParameterJdbcTemplate jdbc;

    PassportSnapshotBuilder(SupplyStepRepository steps, ProductRepository products, CompanyRepository companies,
            DocumentRepository documents, NamedParameterJdbcTemplate jdbc) {
        this.steps = steps;
        this.products = products;
        this.companies = companies;
        this.documents = documents;
        this.jdbc = jdbc;
    }

    Built build(UUID companyId, Batch batch, int version, @Nullable Instant publishedAt, LocalDate today) {
        Product product = products.findByIdAndCompanyId(batch.getProductId(), companyId).orElseThrow();
        Company manufacturer = companies.findById(companyId).orElseThrow();

        List<SupplyStep> chain = steps.findByBatchIdIn(List.of(batch.getId())).stream().sorted(CHAIN_ORDER).toList();
        Map<UUID, String> keys = new HashMap<>();
        for (int i = 0; i < chain.size(); i++) {
            keys.put(chain.get(i).getId(), "s" + (i + 1));
        }
        Map<UUID, List<UUID>> inputs = inputsOf(keys);
        Map<UUID, Company> suppliers = new HashMap<>();
        companies.findAllById(chain.stream().map(SupplyStep::getSupplierCompanyId).filter(java.util.Objects::nonNull)
                .distinct().toList()).forEach(c -> suppliers.put(c.getId(), c));

        List<SnapshotCertificate> certificates = new ArrayList<>();
        Map<UUID, List<String>> certificateKeys = new HashMap<>();
        if (!chain.isEmpty()) {
            List<Document> confirmed = documents.confirmedOfSteps(companyId, keys.keySet());
            Map<UUID, SupplyStep> byId = new HashMap<>();
            chain.forEach(s -> byId.put(s.getId(), s));
            // Chain order, then the order they were uploaded in; only those of approved steps.
            List<Document> ordered = confirmed.stream()
                    .filter(d -> d.getDocType().isCertificate() && d.getValidUntil() != null
                            && !d.getValidUntil().isBefore(today) && d.getStepId() != null
                            && byId.get(d.getStepId()).getStatus() == StepStatus.APPROVED)
                    .sorted(Comparator.comparingInt((Document d) -> keyNumber(keys.get(d.getStepId())))
                            .thenComparing(Document::getCreatedAt))
                    .toList();
            for (Document d : ordered) {
                String key = "c" + (certificates.size() + 1);
                certificates.add(new SnapshotCertificate(key, d.getDocType(), d.getCertNo(), d.getHolderName(),
                        d.getIssuer(), d.getValidFrom(), d.getValidUntil()));
                certificateKeys.computeIfAbsent(d.getStepId(), id -> new ArrayList<>()).add(key);
            }
        }

        boolean allApproved = !chain.isEmpty();
        List<SnapshotStep> snapshotSteps = new ArrayList<>();
        for (SupplyStep step : chain) {
            boolean approved = step.getStatus() == StepStatus.APPROVED;
            allApproved &= approved;
            List<String> inputKeys = inputs.getOrDefault(step.getId(), List.of()).stream().map(keys::get)
                    .sorted(Comparator.comparingInt(PassportSnapshotBuilder::keyNumber)).toList();
            Company supplier = step.getSupplierCompanyId() == null ? null : suppliers.get(step.getSupplierCompanyId());
            snapshotSteps.add(new SnapshotStep(keys.get(step.getId()), step.getStepType(), approved,
                    approved ? step.getApprovedAt() : null, inputKeys,
                    supplier == null ? null : new SnapshotActor(supplier.getName(), supplier.getCity(),
                            supplier.getCountry()),
                    approved ? publicData(step.getData()) : null,
                    approved ? certificateKeys.getOrDefault(step.getId(), List.of()) : List.of()));
        }

        PassportSnapshot snapshot = new PassportSnapshot(PassportSnapshot.SCHEMA_VERSION,
                new SnapshotPassport(version, publishedAt, product.getGtin(), batch.getBatchNo()),
                new SnapshotManufacturer(manufacturer.getName(), manufacturer.getCity(), manufacturer.getCountry()),
                new SnapshotProduct(product.getName(), product.getCategory(), product.getDescription(),
                        product.getDeclaredFiberComposition(), product.getCareInfo()),
                new SnapshotBatch(batch.getProducedFrom(), batch.getProducedTo()), snapshotSteps, certificates);
        return new Built(snapshot, allApproved);
    }

    private Map<UUID, List<UUID>> inputsOf(Map<UUID, String> keys) {
        Map<UUID, List<UUID>> inputs = new HashMap<>();
        if (keys.isEmpty()) {
            return inputs;
        }
        jdbc.query("SELECT step_id, input_step_id FROM supply_step_input WHERE step_id IN (:ids)",
                Map.of("ids", keys.keySet()), rs -> {
                    UUID input = rs.getObject("input_step_id", UUID.class);
                    // Links stay inside one batch (V4), so the input is in `keys` too.
                    if (keys.containsKey(input)) {
                        inputs.computeIfAbsent(rs.getObject("step_id", UUID.class), id -> new ArrayList<>()).add(input);
                    }
                });
        return inputs;
    }

    /** The whitelist: the fields a consumer may see; quantities, harvest year and shade stay out. */
    static SnapshotStepData publicData(StepData d) {
        return new SnapshotStepData(d.fiberType(), d.originCountry(), d.originRegion(), d.fiberComposition(),
                d.energySources(), d.energyKwhPerKg(), d.energyKwhPerPiece(), d.yarnCount(), d.yarnProcess(),
                d.fabricType(), d.gsm(), d.dyeProcess(), d.dyeProcessOther(), d.chemicalStandards(),
                d.waterLPerKg());
    }

    private static int keyNumber(String key) {
        return Integer.parseInt(key.substring(1));
    }
}
