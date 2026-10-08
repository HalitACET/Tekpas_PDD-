package com.tekpas.batch;

import com.tekpas.batch.dto.BatchCreateRequest;
import com.tekpas.batch.dto.BatchResponse;
import com.tekpas.batch.dto.BatchStatusCounts;
import com.tekpas.batch.dto.BatchUpdateRequest;
import com.tekpas.batch.dto.NextBatchNoResponse;
import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.common.web.PageQuery;
import com.tekpas.common.web.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1/batches", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "batches", description = "Production batches of the current company; a passport is published per batch")
@ReadAccess
public class BatchController {

    private static final Map<String, String> SORT_FIELDS = Map.of(
            "batchNo", "batchNo", "createdAt", "createdAt", "updatedAt", "updatedAt",
            "producedFrom", "producedFrom", "quantity", "quantity", "productName", "p.name");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));

    private final BatchService service;
    private final CurrentUser currentUser;

    public BatchController(BatchService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "listBatches", summary = "List batches with product and supply chain progress")
    @ApiResponse(responseCode = "200", description = "One page of batches")
    @ApiResponse(responseCode = "400", description = "Invalid paging or sort parameter")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "supplierId is not in the company's supplier network")
    public PageResponse<BatchResponse> listBatches(
            @Parameter(description = "Search in batch no, production order no, product name and GTIN")
            @RequestParam(required = false) @Nullable String q,
            @RequestParam(required = false) @Nullable UUID productId,
            @RequestParam(required = false) @Nullable BatchStatus status,
            @Parameter(description = "Batches whose supply chain has a step of this supplier (404 if the supplier is "
                    + "not in the company's network)")
            @RequestParam(required = false) @Nullable UUID supplierId,
            @Parameter(description = "Zero-based page") @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(PageQuery.MAX_SIZE) int size,
            @Parameter(description = "batchNo | productName | quantity | producedFrom | createdAt | updatedAt, "
                    + "optionally ,asc or ,desc (default createdAt,desc)")
            @RequestParam(required = false) @Nullable String sort) {
        return service.list(currentUser.companyId(), productId, status, supplierId, PageQuery.containsPattern(q),
                PageQuery.of(page, size, sort, SORT_FIELDS, DEFAULT_SORT));
    }

    @GetMapping("/status-counts")
    @Operation(operationId = "getBatchStatusCounts", summary = "Count batches per status",
            description = "All batches of the company, independent of the list's search and filters")
    @ApiResponse(responseCode = "200", description = "Count per status, zero included")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public BatchStatusCounts getBatchStatusCounts() {
        return service.statusCounts(currentUser.companyId());
    }

    @GetMapping("/next-batch-no")
    @Operation(operationId = "getNextBatchNo", summary = "Suggest the next batch number of today (not reserved)")
    @ApiResponse(responseCode = "200", description = "Suggested number, e.g. KP-2026-1003-B")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public NextBatchNoResponse getNextBatchNo() {
        return service.nextBatchNo(currentUser.companyId());
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getBatch", summary = "A batch with its product and supply chain progress")
    @ApiResponse(responseCode = "200", description = "The batch")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public BatchResponse getBatch(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "createBatch", summary = "Create a DRAFT batch of a product",
            description = "Without batchNo the next KP-YYYY-MMDD-<letter> number of the day is assigned.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(responseCode = "400", description = "Validation failed (e.g. Pattern on batchNo, DateRange)")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such product in this company")
    @ApiResponse(responseCode = "409", description = "The product already has a batch with this number")
    public ResponseEntity<BatchResponse> createBatch(@Valid @RequestBody BatchCreateRequest request) {
        BatchResponse created = service.create(currentUser.companyId(), request);
        return ResponseEntity.created(URI.create("/api/v1/batches/" + created.id())).body(created);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "updateBatch", summary = "Change some fields of a batch",
            description = "Missing fields stay unchanged; null clears productionOrderNo and the dates. "
                    + "Status and product cannot be changed here (such fields are ignored).")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "Batch number taken, or changed after DRAFT")
    public BatchResponse updateBatch(@PathVariable UUID id, @Valid @RequestBody BatchUpdateRequest request) {
        return service.update(currentUser.companyId(), id, request);
    }

    @DeleteMapping("/{id}")
    @WriteAccess
    @Operation(operationId = "deleteBatch", summary = "Delete a DRAFT batch without a passport")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "Not DRAFT (BATCH_NOT_DRAFT) or has a passport "
            + "(BATCH_HAS_PASSPORT)")
    public ResponseEntity<Void> deleteBatch(@PathVariable UUID id) {
        service.delete(currentUser.companyId(), id);
        return ResponseEntity.noContent().build();
    }
}
