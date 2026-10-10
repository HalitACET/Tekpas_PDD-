package com.tekpas.supplychain;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.ReviewAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.supplychain.dto.ChainPreviewResponse;
import com.tekpas.supplychain.dto.ChainResponse;
import com.tekpas.supplychain.dto.StepCreateRequest;
import com.tekpas.supplychain.dto.StepRejectRequest;
import com.tekpas.supplychain.dto.StepUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "supply-chain", description = "A batch's supply chain: steps and the links between them (a DAG)")
@ReadAccess
public class ChainController {

    private final ChainService service;
    private final StepReviewService review;
    private final CurrentUser currentUser;

    public ChainController(ChainService service, StepReviewService review, CurrentUser currentUser) {
        this.service = service;
        this.review = review;
        this.currentUser = currentUser;
    }

    @GetMapping("/batches/{id}/chain")
    @Operation(operationId = "getChain", summary = "A batch's supply chain",
            description = "Flat list of steps; each step names the steps whose output it uses (inputStepIds).")
    @ApiResponse(responseCode = "200", description = "The chain")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    public ChainResponse getChain(@PathVariable UUID id) {
        return service.chain(currentUser.companyId(), id);
    }

    @PostMapping("/batches/{id}/chain")
    @WriteAccess
    @Operation(operationId = "createDefaultChain", summary = "Give a batch without steps the default chain",
            description = "FIBER → YARN → FABRIC → DYEING → SEWING, without suppliers. For batches created before "
                    + "supply chains existed; new batches get their chain when they are created.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such batch in this company")
    @ApiResponse(responseCode = "409", description = "The batch already has steps (reason CHAIN_EXISTS)")
    public ResponseEntity<ChainResponse> createDefaultChain(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createDefaultChain(currentUser.companyId(), id));
    }

    @GetMapping("/products/{id}/chain-preview")
    @Operation(operationId = "getChainPreview", summary = "What a new batch of the product starts with",
            description = "The product's last chain is copied; without one, the default five-step chain is used.")
    @ApiResponse(responseCode = "200", description = "Step count and source batch")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such product in this company")
    public ChainPreviewResponse getChainPreview(@PathVariable UUID id) {
        return service.preview(currentUser.companyId(), id);
    }

    @PostMapping(path = "/batches/{id}/steps", consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "addStep", summary = "Add a step to a batch's chain")
    @ApiResponse(responseCode = "201", description = "The chain with the new step")
    @ApiResponse(responseCode = "400", description = "Validation failed (SupplierType, SameBatch, Cycle, …)")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such batch, or supplier not in the network")
    public ResponseEntity<ChainResponse> addStep(@PathVariable UUID id, @Valid @RequestBody StepCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.addStep(currentUser.companyId(), id, request));
    }

    @PatchMapping(path = "/steps/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "updateStep", summary = "Assign a supplier, set the data or the inputs of a step")
    @ApiResponse(responseCode = "200", description = "The chain after the change")
    @ApiResponse(responseCode = "400", description = "Validation failed (NotApplicable, EnergyTotal, Cycle, …)")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company, or supplier not in the network")
    @ApiResponse(responseCode = "409", description = "The step is approved (reason STEP_APPROVED)")
    public ChainResponse updateStep(@PathVariable UUID id, @Valid @RequestBody StepUpdateRequest request) {
        return service.updateStep(currentUser.companyId(), id, request);
    }

    @PostMapping("/steps/{id}/approve")
    @ReviewAccess
    @Operation(operationId = "approveStep", summary = "Approve the data a supplier submitted",
            description = "SUBMITTED → APPROVED. Once every step is approved the batch becomes READY.")
    @ApiResponse(responseCode = "200", description = "The chain after the approval")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN review steps")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "The step is not submitted (reason STEP_NOT_SUBMITTED)")
    public ChainResponse approveStep(@PathVariable UUID id) {
        UUID batchId = review.approve(currentUser.companyId(), currentUser.userId(), id);
        return service.chain(currentUser.companyId(), batchId);
    }

    @PostMapping(path = "/steps/{id}/reject", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ReviewAccess
    @Operation(operationId = "rejectStep", summary = "Ask the supplier for a correction",
            description = "SUBMITTED → REJECTED with the reason and the fields to mark; then a new link is sent.")
    @ApiResponse(responseCode = "200", description = "The chain after the rejection")
    @ApiResponse(responseCode = "400", description = "No reason, or a field the step type does not have (fields)")
    @ApiResponse(responseCode = "403", description = "Only OWNER and ADMIN review steps")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "The step is not submitted (reason STEP_NOT_SUBMITTED)")
    public ChainResponse rejectStep(@PathVariable UUID id, @Valid @RequestBody StepRejectRequest request) {
        UUID batchId = review.reject(currentUser.companyId(), currentUser.userId(), id, request);
        return service.chain(currentUser.companyId(), batchId);
    }

    @DeleteMapping("/steps/{id}")
    @WriteAccess
    @Operation(operationId = "deleteStep", summary = "Remove a pending step and its links")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such step in this company")
    @ApiResponse(responseCode = "409", description = "The step is not pending (reason STEP_NOT_PENDING)")
    public ResponseEntity<Void> deleteStep(@PathVariable UUID id) {
        service.deleteStep(currentUser.companyId(), id);
        return ResponseEntity.noContent().build();
    }
}
