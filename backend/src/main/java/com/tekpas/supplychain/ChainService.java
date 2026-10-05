package com.tekpas.supplychain;

import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.batch.dto.ChainSummary;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.company.SupplierService;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.dto.ChainPreviewResponse;
import com.tekpas.supplychain.dto.ChainResponse;
import com.tekpas.supplychain.dto.ChainStepResponse;
import com.tekpas.supplychain.dto.StepCreateRequest;
import com.tekpas.supplychain.dto.StepSupplier;
import com.tekpas.supplychain.dto.StepUpdateRequest;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A batch's supply chain: steps and the links between them (a DAG, V4). New batches start with a copy of the
 * product's last chain (structure and suppliers; statuses back to PENDING, data cleared) or, for the first
 * batch, the default FIBER → YARN → FABRIC → DYEING → SEWING chain.
 */
@Service
public class ChainService {

    private static final Comparator<SupplyStep> CHAIN_ORDER = Comparator
            .comparing(SupplyStep::getStepType)
            .thenComparingInt(SupplyStep::getSortOrder)
            .thenComparing(SupplyStep::getCreatedAt)
            .thenComparing(SupplyStep::getId);

    private final SupplyStepRepository steps;
    private final ChainLinks links;
    private final BatchRepository batches;
    private final ProductRepository products;
    private final CompanyRepository companies;
    private final SupplierService suppliers;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ChainService(SupplyStepRepository steps, ChainLinks links, BatchRepository batches,
            ProductRepository products, CompanyRepository companies, SupplierService suppliers, JdbcTemplate jdbc,
            Clock clock) {
        this.steps = steps;
        this.links = links;
        this.batches = batches;
        this.products = products;
        this.companies = companies;
        this.suppliers = suppliers;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ChainResponse chain(UUID companyId, UUID batchId) {
        requireBatch(companyId, batchId);
        return chainOf(batchId);
    }

    /** For a batch without any step (e.g. created before M3): the default chain. */
    @Transactional
    public ChainResponse createDefaultChain(UUID companyId, UUID batchId) {
        requireBatch(companyId, batchId);
        if (steps.countByBatchId(batchId) > 0) {
            throw ConflictException.state("CHAIN_EXISTS", "The batch already has a supply chain");
        }
        createDefault(batchId);
        return chainOf(batchId);
    }

    /** Called when a batch is created: copy the product's last chain, or start with the default one. */
    @Transactional
    public void startChain(Batch batch) {
        UUID source = lastChainOf(batch.getCompanyId(), batch.getProductId(), batch.getId());
        if (source == null) {
            createDefault(batch.getId());
        } else {
            copy(source, batch);
        }
    }

    @Transactional(readOnly = true)
    public ChainPreviewResponse preview(UUID companyId, UUID productId) {
        products.findByIdAndCompanyId(productId, companyId)
                .orElseThrow(() -> new NotFoundException("Product not found"));
        UUID source = lastChainOf(companyId, productId, null);
        if (source == null) {
            return new ChainPreviewResponse(StepType.DEFAULT_CHAIN.size(), null);
        }
        String batchNo = jdbc.queryForObject("SELECT batch_no FROM batch WHERE id = ?", String.class, source);
        return new ChainPreviewResponse((int) steps.countByBatchId(source), batchNo);
    }

    @Transactional
    public ChainResponse addStep(UUID companyId, UUID batchId, StepCreateRequest request) {
        requireBatch(companyId, batchId);
        SupplyStep step = new SupplyStep(batchId, request.stepType(), nextSortOrder(batchId, request.stepType()),
                clock.instant());
        if (request.supplierId() != null) {
            step.assignSupplier(requireSupplier(companyId, request.stepType(), request.supplierId()).getId());
        }
        steps.saveAndFlush(step);
        List<UUID> inputs = nonNull(request.inputStepIds());
        List<UUID> outputs = nonNull(request.outputStepIds());
        requireSameBatch(batchId, inputs, "inputStepIds");
        requireSameBatch(batchId, outputs, "outputStepIds");
        for (UUID input : inputs) {
            links.add(step.getId(), input);
        }
        for (UUID output : outputs) {
            if (links.wouldCycle(output, step.getId())) {
                throw new InvalidFieldsException(new FieldViolation("outputStepIds", "Cycle",
                        "The links would form a cycle"));
            }
            links.add(output, step.getId());
        }
        return chainOf(batchId);
    }

    @Transactional
    public ChainResponse updateStep(UUID companyId, UUID stepId, StepUpdateRequest request) {
        SupplyStep step = steps.lockForUpdate(stepId, companyId).orElseThrow(ChainService::stepNotFound);
        if (step.getStatus() == StepStatus.APPROVED) {
            throw ConflictException.state("STEP_APPROVED", "An approved step cannot change");
        }
        if (request.supplierId() != null) {
            UUID supplierId = request.supplierId().orElse(null);
            step.assignSupplier(supplierId == null ? null
                    : requireSupplier(companyId, step.getStepType(), supplierId).getId());
        }
        if (request.data() != null) {
            StepData data = request.data().orElse(StepData.EMPTY);
            List<String> wrong = data.fieldsNotFor(step.getStepType());
            if (!wrong.isEmpty()) {
                throw new InvalidFieldsException(wrong.stream()
                        .map(field -> new FieldViolation("data." + field, "NotApplicable",
                                "Not a field of a " + step.getStepType() + " step"))
                        .toArray(FieldViolation[]::new));
            }
            step.replaceData(data);
        }
        if (request.inputStepIds() != null) {
            List<UUID> inputs = request.inputStepIds().orElseThrow();
            requireSameBatch(step.getBatchId(), inputs, "inputStepIds");
            links.removeInputsOf(step.getId());
            for (UUID input : inputs) {
                if (links.wouldCycle(step.getId(), input)) {
                    throw new InvalidFieldsException(new FieldViolation("inputStepIds", "Cycle",
                            "The links would form a cycle"));
                }
                links.add(step.getId(), input);
            }
        }
        step.touch(clock.instant());
        steps.saveAndFlush(step);
        return chainOf(step.getBatchId());
    }

    @Transactional
    public void deleteStep(UUID companyId, UUID stepId) {
        SupplyStep step = steps.lockForUpdate(stepId, companyId).orElseThrow(ChainService::stepNotFound);
        if (step.getStatus() != StepStatus.PENDING) {
            throw ConflictException.state("STEP_NOT_PENDING", "Only a pending step can be removed");
        }
        // Links in both directions go with the step (ON DELETE CASCADE).
        steps.delete(step);
    }

    private ChainResponse chainOf(UUID batchId) {
        List<SupplyStep> chain = steps.findByBatchId(batchId).stream().sorted(CHAIN_ORDER).toList();
        Map<UUID, List<UUID>> inputs = links.inputsOf(chain.stream().map(SupplyStep::getId).toList());
        Set<UUID> supplierIds = chain.stream().map(SupplyStep::getSupplierCompanyId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, Company> supplierById = companies.findAllById(supplierIds).stream()
                .collect(Collectors.toMap(Company::getId, Function.identity()));

        List<ChainStepResponse> nodes = chain.stream().map(step -> {
            Company supplier = step.getSupplierCompanyId() == null ? null : supplierById.get(step.getSupplierCompanyId());
            return new ChainStepResponse(step.getId(), step.getStepType(), step.getStatus(),
                    supplier == null ? null
                            : new StepSupplier(supplier.getId(), supplier.getName(), supplier.getCity(), supplier.getType()),
                    step.getSortOrder(), inputs.getOrDefault(step.getId(), List.of()), step.getData(), 0,
                    step.getSubmittedAt(), step.getUpdatedAt());
        }).toList();
        int approved = (int) chain.stream().filter(s -> s.getStatus() == StepStatus.APPROVED).count();
        List<StepType> unassigned = chain.stream()
                .filter(s -> s.getStepType().supplierType() != null && s.getSupplierCompanyId() == null)
                .map(SupplyStep::getStepType).distinct().sorted().toList();
        return new ChainResponse(batchId, nodes, new ChainSummary(chain.size(), approved), unassigned);
    }

    private void createDefault(UUID batchId) {
        SupplyStep previous = null;
        for (StepType type : StepType.DEFAULT_CHAIN) {
            SupplyStep step = steps.saveAndFlush(new SupplyStep(batchId, type, 0, clock.instant()));
            if (previous != null) {
                links.add(step.getId(), previous.getId());
            }
            previous = step;
        }
    }

    /** Structure and suppliers (those still in the network); statuses back to PENDING, data cleared. */
    private void copy(UUID sourceBatchId, Batch target) {
        List<SupplyStep> source = steps.findByBatchId(sourceBatchId).stream().sorted(CHAIN_ORDER).toList();
        Map<UUID, UUID> copyOf = new HashMap<>();
        for (SupplyStep original : source) {
            SupplyStep step = new SupplyStep(target.getId(), original.getStepType(), original.getSortOrder(),
                    clock.instant());
            UUID supplierId = original.getSupplierCompanyId();
            if (supplierId != null && suppliers.linked(target.getCompanyId(), supplierId).isPresent()) {
                step.assignSupplier(supplierId);
            }
            copyOf.put(original.getId(), steps.saveAndFlush(step).getId());
        }
        links.inputsOf(copyOf.keySet()).forEach((stepId, inputIds) -> inputIds.forEach(
                input -> links.add(copyOf.get(stepId), copyOf.get(input))));
    }

    /** The product's most recent other batch that has a chain. */
    private @Nullable UUID lastChainOf(UUID companyId, UUID productId, @Nullable UUID exceptBatchId) {
        List<UUID> found = jdbc.queryForList("""
                SELECT b.id FROM batch b
                WHERE b.product_id = ? AND b.company_id = ? AND b.id IS DISTINCT FROM ?
                  AND EXISTS (SELECT 1 FROM supply_step s WHERE s.batch_id = b.id)
                ORDER BY b.created_at DESC, b.id DESC LIMIT 1
                """, UUID.class, productId, companyId, exceptBatchId);
        return found.isEmpty() ? null : found.getFirst();
    }

    private int nextSortOrder(UUID batchId, StepType type) {
        return steps.findByBatchId(batchId).stream().filter(s -> s.getStepType() == type)
                .mapToInt(SupplyStep::getSortOrder).max().orElse(-1) + 1;
    }

    private void requireBatch(UUID companyId, UUID batchId) {
        batches.findByIdAndCompanyId(batchId, companyId).orElseThrow(() -> new NotFoundException("Batch not found"));
    }

    /** A supplier of the company's network (404 otherwise) whose type fits the step (field error otherwise). */
    private Company requireSupplier(UUID companyId, StepType stepType, UUID supplierId) {
        if (stepType.supplierType() == null) {
            throw new InvalidFieldsException(new FieldViolation("supplierId", "NotApplicable",
                    "A " + stepType + " step has no supplier"));
        }
        Company supplier = suppliers.linked(companyId, supplierId)
                .orElseThrow(() -> new NotFoundException("Supplier not found"));
        if (supplier.getType() != stepType.supplierType()) {
            throw new InvalidFieldsException(new FieldViolation("supplierId", "SupplierType",
                    "A " + stepType + " step needs a " + stepType.supplierType() + " supplier"));
        }
        return supplier;
    }

    /** Linked steps must exist in the same batch: a field error otherwise (also for another company's steps). */
    private void requireSameBatch(UUID batchId, List<UUID> stepIds, String field) {
        if (stepIds.isEmpty()) {
            return;
        }
        Map<UUID, UUID> batchOf = links.batchOf(new HashSet<>(stepIds));
        boolean foreign = stepIds.stream().anyMatch(id -> !batchId.equals(batchOf.get(id)));
        if (foreign) {
            throw new InvalidFieldsException(new FieldViolation(field, "SameBatch",
                    "Steps can only be linked within one batch"));
        }
    }

    private static List<UUID> nonNull(@Nullable List<UUID> ids) {
        return ids == null ? List.of() : new ArrayList<>(new LinkedHashSet<>(ids));
    }

    private static NotFoundException stepNotFound() {
        return new NotFoundException("Step not found");
    }
}
