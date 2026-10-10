package com.tekpas.task;

import com.tekpas.batch.Batch;
import com.tekpas.batch.BatchRepository;
import com.tekpas.batch.BatchStatus;
import com.tekpas.company.Company;
import com.tekpas.company.CompanyRepository;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.request.DataRequest;
import com.tekpas.request.DataRequestRepository;
import com.tekpas.request.RequestStatus;
import com.tekpas.supplychain.StepStatus;
import com.tekpas.supplychain.StepType;
import com.tekpas.supplychain.SupplyStep;
import com.tekpas.supplychain.SupplyStepRepository;
import com.tekpas.task.dto.TaskItem;
import com.tekpas.task.dto.TasksResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What waits for the manufacturer (design v0.4 48a), computed from the chains of the company's batches that are
 * not published. Certificates running out join with M7.
 */
@Service
public class TaskService {

    /** A link closer than this to its deadline needs a reminder ("Hatırlat"). */
    static final Duration EXPIRING = Duration.ofDays(2);

    private final BatchRepository batches;
    private final ProductRepository products;
    private final SupplyStepRepository steps;
    private final CompanyRepository companies;
    private final DataRequestRepository requests;
    private final Clock clock;

    public TaskService(BatchRepository batches, ProductRepository products, SupplyStepRepository steps,
            CompanyRepository companies, DataRequestRepository requests, Clock clock) {
        this.batches = batches;
        this.products = products;
        this.steps = steps;
        this.companies = companies;
        this.requests = requests;
        this.clock = clock;
    }

    /** @param reviewer OWNER or ADMIN: only they see the data waiting for approval */
    @Transactional(readOnly = true)
    public TasksResponse tasks(UUID companyId, boolean reviewer) {
        Instant now = clock.instant();
        Map<UUID, Batch> batchById = batches.findByCompanyIdAndStatusNot(companyId, BatchStatus.PUBLISHED).stream()
                .collect(Collectors.toMap(Batch::getId, Function.identity()));
        Map<UUID, String> productName = products.findAllById(batchById.values().stream().map(Batch::getProductId)
                .collect(Collectors.toSet())).stream().collect(Collectors.toMap(Product::getId, Product::getName));
        List<SupplyStep> chainSteps = steps.findOpenOfCompany(companyId).stream()
                .sorted(Comparator.comparing((SupplyStep s) -> batchById.get(s.getBatchId()).getBatchNo())
                        .thenComparing(SupplyStep::getStepType).thenComparingInt(SupplyStep::getSortOrder))
                .toList();
        Set<UUID> supplierIds = chainSteps.stream().map(SupplyStep::getSupplierCompanyId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<UUID, String> supplierName = companies.findAllById(supplierIds).stream()
                .collect(Collectors.toMap(Company::getId, Company::getName));
        Map<UUID, List<DataRequest>> requestsByStep = requests
                .findByStepIdInOrderByCreatedAtDesc(chainSteps.stream().map(SupplyStep::getId).toList()).stream()
                .collect(Collectors.groupingBy(DataRequest::getStepId));

        List<TaskItem> review = new ArrayList<>();
        List<TaskItem> overdue = new ArrayList<>();
        List<TaskItem> expiring = new ArrayList<>();
        List<TaskItem> incomplete = new ArrayList<>();
        for (SupplyStep step : chainSteps) {
            Batch batch = batchById.get(step.getBatchId());
            String product = productName.get(batch.getProductId());
            String supplier = step.getSupplierCompanyId() == null ? null : supplierName.get(step.getSupplierCompanyId());
            List<DataRequest> stepRequests = requestsByStep.getOrDefault(step.getId(), List.of());
            DataRequest latest = stepRequests.isEmpty() ? null : stepRequests.getFirst();
            Item item = new Item(batch, product, step, supplier);

            switch (step.getStatus()) {
                case SUBMITTED -> {
                    if (reviewer) {
                        DataRequest completed = stepRequests.stream()
                                .filter(r -> r.getStatus() == RequestStatus.COMPLETED).findFirst().orElse(null);
                        review.add(item.of(TaskKind.STEP_SUBMITTED, step.getSubmittedAt(), null, null,
                                completed == null ? null : completed.getSubmitterName(), step.getData().filledCount()));
                    }
                }
                case REJECTED -> {
                    boolean newLink = latest != null && step.getRejectedAt() != null
                            && latest.getCreatedAt().isAfter(step.getRejectedAt());
                    if (!newLink) {
                        overdue.add(item.of(TaskKind.CORRECTION_NO_LINK, step.getRejectedAt(), null, null, null, null));
                    } else {
                        followLink(item, latest, now, overdue, expiring);
                    }
                }
                case PENDING -> {
                    if (step.getStepType() == StepType.FIBER) {
                        incomplete.add(item.of(TaskKind.ORIGIN_MISSING, null, null, null, null, null));
                    } else if (step.getSupplierCompanyId() == null) {
                        incomplete.add(item.of(TaskKind.STEP_UNASSIGNED, null, null, null, null, null));
                    } else if (latest != null) {
                        followLink(item, latest, now, overdue, expiring);
                    }
                }
                case APPROVED -> { }
            }
        }
        Set<UUID> withChain = chainSteps.stream().map(SupplyStep::getBatchId).collect(Collectors.toSet());
        batchById.values().stream().filter(b -> !withChain.contains(b.getId()))
                .sorted(Comparator.comparing(Batch::getBatchNo))
                .forEach(b -> incomplete.add(new TaskItem(TaskKind.NO_CHAIN, b.getId(), b.getBatchNo(),
                        productName.get(b.getProductId()), null, null, null, null, null, null, null, null)));

        review.sort(Comparator.comparing(TaskItem::at, Comparator.nullsLast(Comparator.naturalOrder())));
        overdue.sort(Comparator.comparing(t -> t.at() != null ? t.at() : t.deadline(),
                Comparator.nullsLast(Comparator.naturalOrder())));
        expiring.sort(Comparator.comparing(TaskItem::deadline));
        List<TaskItem> followUp = new ArrayList<>(overdue);
        followUp.addAll(expiring);
        return new TasksResponse(review.size() + followUp.size() + incomplete.size(), review, followUp, incomplete);
    }

    /** An expired link without a submission, or one whose deadline is near. */
    private static void followLink(Item item, DataRequest latest, Instant now, List<TaskItem> overdue,
            List<TaskItem> expiring) {
        boolean expired = latest.getStatus() == RequestStatus.EXPIRED
                || latest.getStatus().isOpen() && !now.isBefore(latest.getExpiresAt());
        if (expired) {
            overdue.add(item.of(TaskKind.LINK_EXPIRED, null, latest.getExpiresAt(), latest.getOpenCount(), null, null));
        } else if (latest.getStatus().isOpen() && latest.getExpiresAt().isBefore(now.plus(EXPIRING))) {
            expiring.add(item.of(TaskKind.LINK_EXPIRING, null, latest.getExpiresAt(), latest.getOpenCount(), null,
                    null));
        }
    }

    private record Item(Batch batch, String product, SupplyStep step, @Nullable String supplier) {

        TaskItem of(TaskKind kind, @Nullable Instant at, @Nullable Instant deadline, @Nullable Integer openCount,
                @Nullable String submitterName, @Nullable Integer filledFields) {
            return new TaskItem(kind, batch.getId(), batch.getBatchNo(), product, step.getId(), step.getStepType(),
                    supplier, at, deadline, openCount, submitterName, filledFields);
        }
    }
}
