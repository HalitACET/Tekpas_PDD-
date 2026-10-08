package com.tekpas.batch;

import com.tekpas.batch.dto.BatchCreateRequest;
import com.tekpas.batch.dto.BatchProduct;
import com.tekpas.batch.dto.BatchResponse;
import com.tekpas.batch.dto.BatchStatusCounts;
import com.tekpas.batch.dto.BatchUpdateRequest;
import com.tekpas.batch.dto.ChainSummary;
import com.tekpas.batch.dto.NextBatchNoResponse;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.company.SupplierService;
import com.tekpas.common.persistence.Constraints;
import com.tekpas.common.web.PageResponse;
import com.tekpas.product.Product;
import com.tekpas.product.ProductRepository;
import com.tekpas.supplychain.ChainService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BatchService {

    /** V1: {@code UNIQUE (product_id, batch_no)}. */
    static final String BATCH_NO_UNIQUE = "batch_product_id_batch_no_key";

    private final BatchRepository batches;
    private final ProductRepository products;
    private final BatchNumbers numbers;
    private final ChainCounts chainCounts;
    private final JdbcTemplate jdbc;
    private final ChainService chains;
    private final SupplierService suppliers;
    private final Clock clock;

    public BatchService(BatchRepository batches, ProductRepository products, BatchNumbers numbers,
            ChainCounts chainCounts, JdbcTemplate jdbc, ChainService chains, SupplierService suppliers, Clock clock) {
        this.batches = batches;
        this.products = products;
        this.numbers = numbers;
        this.chainCounts = chainCounts;
        this.jdbc = jdbc;
        this.chains = chains;
        this.suppliers = suppliers;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<BatchResponse> list(UUID companyId, @Nullable UUID productId, @Nullable BatchStatus status,
            @Nullable UUID supplierId, @Nullable String q, Pageable pageable) {
        // A supplier outside the own network is not found, like any other company's record (not an empty list).
        if (supplierId != null && suppliers.linked(companyId, supplierId).isEmpty()) {
            throw new NotFoundException("No such supplier in this company's network");
        }
        Page<BatchRow> page = batches.search(companyId, productId, status, supplierId, q, pageable);
        Map<UUID, ChainSummary> chains = chainCounts.of(page.map(BatchRow::id).getContent());
        return PageResponse.of(page).map(row -> toResponse(row, ChainCounts.orEmpty(chains, row.id())));
    }

    @Transactional(readOnly = true)
    public BatchResponse get(UUID companyId, UUID id) {
        BatchRow row = batches.findRow(id, companyId).orElseThrow(BatchService::notFound);
        return toResponse(row, chainCounts.of(id));
    }

    @Transactional(readOnly = true)
    public BatchStatusCounts statusCounts(UUID companyId) {
        Map<BatchStatus, Long> counts = new EnumMap<>(BatchStatus.class);
        jdbc.query("SELECT status, count(*) FROM batch WHERE company_id = ? GROUP BY status",
                rs -> {
                    counts.put(BatchStatus.valueOf(rs.getString(1)), rs.getLong(2));
                }, companyId);
        long all = counts.values().stream().mapToLong(Long::longValue).sum();
        return new BatchStatusCounts(all, counts.getOrDefault(BatchStatus.DRAFT, 0L),
                counts.getOrDefault(BatchStatus.COLLECTING, 0L), counts.getOrDefault(BatchStatus.READY, 0L),
                counts.getOrDefault(BatchStatus.PUBLISHED, 0L));
    }

    @Transactional(readOnly = true)
    public NextBatchNoResponse nextBatchNo(UUID companyId) {
        return new NextBatchNoResponse(numbers.peek(companyId));
    }

    @Transactional
    public BatchResponse create(UUID companyId, BatchCreateRequest request) {
        Product product = products.lockForShare(request.productId(), companyId)
                .orElseThrow(() -> new NotFoundException("Product not found"));
        requireDateOrder(request.producedFrom(), request.producedTo());
        String batchNo = request.batchNo() == null || request.batchNo().isEmpty()
                ? numbers.next(companyId)
                : request.batchNo();

        Batch batch = new Batch(product.getId(), companyId, batchNo, request.quantity(), clock.instant());
        batch.setProductionOrderNo(trimToNull(request.productionOrderNo()));
        batch.setProducedFrom(request.producedFrom());
        batch.setProducedTo(request.producedTo());
        saveAndFlush(batch);
        // The product's last chain is copied (or the default one started): the batch is ready for suppliers.
        chains.startChain(batch);
        return toResponse(batch, product, chainCounts.of(batch.getId()));
    }

    @Transactional
    public BatchResponse update(UUID companyId, UUID id, BatchUpdateRequest request) {
        Batch batch = batches.lockForUpdate(id, companyId).orElseThrow(BatchService::notFound);

        if (request.batchNo() != null) {
            String batchNo = request.batchNo().orElseThrow();
            if (!batchNo.equals(batch.getBatchNo())) {
                // Published passports and printed QR codes carry the batch number.
                if (batch.getStatus() != BatchStatus.DRAFT) {
                    throw ConflictException.state("BATCH_NOT_DRAFT", "The batch number can only change while DRAFT");
                }
                batch.setBatchNo(batchNo);
            }
        }
        if (request.productionOrderNo() != null) {
            batch.setProductionOrderNo(trimToNull(request.productionOrderNo().orElse(null)));
        }
        if (request.quantity() != null) {
            batch.setQuantity(request.quantity().orElseThrow());
        }
        if (request.producedFrom() != null) {
            batch.setProducedFrom(request.producedFrom().orElse(null));
        }
        if (request.producedTo() != null) {
            batch.setProducedTo(request.producedTo().orElse(null));
        }
        requireDateOrder(batch.getProducedFrom(), batch.getProducedTo());
        batch.touch(clock.instant());
        saveAndFlush(batch);

        Product product = products.findByIdAndCompanyId(batch.getProductId(), companyId).orElseThrow();
        return toResponse(batch, product, chainCounts.of(id));
    }

    @Transactional
    public void delete(UUID companyId, UUID id) {
        Batch batch = batches.lockForUpdate(id, companyId).orElseThrow(BatchService::notFound);
        if (batch.getStatus() != BatchStatus.DRAFT) {
            throw ConflictException.state("BATCH_NOT_DRAFT", "Only DRAFT batches can be deleted");
        }
        Boolean hasPassport = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM passport WHERE batch_id = ?)",
                Boolean.class, id);
        if (Boolean.TRUE.equals(hasPassport)) {
            throw ConflictException.state("BATCH_HAS_PASSPORT", "A batch with a passport cannot be deleted");
        }
        batches.delete(batch);
    }

    private void saveAndFlush(Batch batch) {
        try {
            batches.saveAndFlush(batch);
        } catch (DataIntegrityViolationException e) {
            if (Constraints.violates(e, BATCH_NO_UNIQUE)) {
                throw ConflictException.taken("batchNo", "This product already has a batch with this number");
            }
            throw e;
        }
    }

    private static void requireDateOrder(@Nullable LocalDate from, @Nullable LocalDate to) {
        if (from != null && to != null && to.isBefore(from)) {
            throw new InvalidFieldsException(
                    new FieldViolation("producedTo", "DateRange", "Must not be before producedFrom"));
        }
    }

    private static BatchResponse toResponse(BatchRow row, ChainSummary chain) {
        return new BatchResponse(row.id(), row.batchNo(), new BatchProduct(row.productId(), row.productName(),
                row.gtin()), row.productionOrderNo(), row.status(), row.quantity(), row.producedFrom(),
                row.producedTo(), chain, row.createdAt(), row.updatedAt());
    }

    private static BatchResponse toResponse(Batch b, Product p, ChainSummary chain) {
        return new BatchResponse(b.getId(), b.getBatchNo(), new BatchProduct(p.getId(), p.getName(), p.getGtin()),
                b.getProductionOrderNo(), b.getStatus(), b.getQuantity(), b.getProducedFrom(), b.getProducedTo(),
                chain, b.getCreatedAt(), b.getUpdatedAt());
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Batch not found");
    }

    private static @Nullable String trimToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
