package com.tekpas.company;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.common.web.PageQuery;
import com.tekpas.common.web.PageResponse;
import com.tekpas.company.dto.SupplierCreateRequest;
import com.tekpas.company.dto.SupplierResponse;
import com.tekpas.company.dto.SupplierUpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.net.URI;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
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
@RequestMapping(path = "/api/v1/suppliers", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "suppliers", description = "The current company's supplier network")
@ReadAccess
public class SupplierController {

    private final SupplierService service;
    private final CurrentUser currentUser;

    public SupplierController(SupplierService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "listSuppliers", summary = "List the supplier network")
    @ApiResponse(responseCode = "200", description = "One page of suppliers")
    @ApiResponse(responseCode = "400", description = "Invalid paging or sort parameter")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public PageResponse<SupplierResponse> listSuppliers(
            @Parameter(description = "Search in name and city") @RequestParam(required = false) @Nullable String q,
            @RequestParam(required = false) @Nullable CompanyType type,
            @Parameter(description = "Zero-based page") @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(PageQuery.MAX_SIZE) int size,
            @Parameter(description = "name | city | linkedAt, optionally ,asc or ,desc (default name)")
            @RequestParam(required = false) @Nullable String sort) {
        return service.list(currentUser.companyId(), type, PageQuery.containsPattern(q),
                PageQuery.of(page, size, sort, SupplierService.SORT_FIELDS, SupplierService.defaultSort()));
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getSupplier", summary = "A supplier of the network")
    @ApiResponse(responseCode = "200", description = "The supplier")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "Not in this company's network")
    public SupplierResponse getSupplier(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "createSupplier", summary = "Add a supplier to the network",
            description = "Creates a supplier company without users, owned by the current company for editing.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(responseCode = "400", description = "Validation failed (e.g. SupplierType, Pattern on phone)")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    public ResponseEntity<SupplierResponse> createSupplier(@Valid @RequestBody SupplierCreateRequest request) {
        SupplierResponse created = service.create(currentUser.companyId(), request);
        return ResponseEntity.created(URI.create("/api/v1/suppliers/" + created.id())).body(created);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "updateSupplier", summary = "Change a supplier",
            description = "The phone can always change; name, type and city only for a supplier the current "
                    + "company created and that has no users.")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "Not in this company's network")
    @ApiResponse(responseCode = "409", description = "SUPPLIER_NOT_EDITABLE, or SUPPLIER_IN_USE for a type change")
    public SupplierResponse updateSupplier(@PathVariable UUID id, @Valid @RequestBody SupplierUpdateRequest request) {
        return service.update(currentUser.companyId(), id, request);
    }

    @DeleteMapping("/{id}")
    @WriteAccess
    @Operation(operationId = "removeSupplier", summary = "Remove a supplier from the network")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "Not in this company's network")
    @ApiResponse(responseCode = "409", description = "Used in a supply chain (reason SUPPLIER_IN_USE)")
    public ResponseEntity<Void> removeSupplier(@PathVariable UUID id) {
        service.remove(currentUser.companyId(), id);
        return ResponseEntity.noContent().build();
    }
}
