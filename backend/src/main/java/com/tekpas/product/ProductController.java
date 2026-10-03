package com.tekpas.product;

import com.tekpas.common.security.CurrentUser;
import com.tekpas.common.security.ReadAccess;
import com.tekpas.common.security.WriteAccess;
import com.tekpas.common.web.PageQuery;
import com.tekpas.common.web.PageResponse;
import com.tekpas.product.dto.ProductCreateRequest;
import com.tekpas.product.dto.ProductListItem;
import com.tekpas.product.dto.ProductResponse;
import com.tekpas.product.dto.ProductUpdateRequest;
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
@RequestMapping(path = "/api/v1/products", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "products", description = "Product models (one GTIN each) of the current company")
@ReadAccess
public class ProductController {

    private static final Map<String, String> SORT_FIELDS = Map.of(
            "name", "name", "gtin", "gtin", "createdAt", "createdAt", "updatedAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id"));

    private final ProductService service;
    private final CurrentUser currentUser;

    public ProductController(ProductService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(operationId = "listProducts", summary = "List products, with their batch count")
    @ApiResponse(responseCode = "200", description = "One page of products")
    @ApiResponse(responseCode = "400", description = "Invalid paging or sort parameter")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    public PageResponse<ProductListItem> listProducts(
            @Parameter(description = "Search in name, SKU and GTIN") @RequestParam(required = false) @Nullable String q,
            @RequestParam(required = false) @Nullable ProductCategory category,
            @Parameter(description = "Zero-based page") @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(PageQuery.MAX_SIZE) int size,
            @Parameter(description = "name | gtin | createdAt | updatedAt, optionally ,asc or ,desc "
                    + "(default createdAt,desc)") @RequestParam(required = false) @Nullable String sort) {
        return service.list(currentUser.companyId(), category, PageQuery.containsPattern(q),
                PageQuery.of(page, size, sort, SORT_FIELDS, DEFAULT_SORT));
    }

    @GetMapping("/{id}")
    @Operation(operationId = "getProduct", summary = "A product with its declared fiber composition")
    @ApiResponse(responseCode = "200", description = "The product")
    @ApiResponse(responseCode = "403", description = "Supplier users have no access")
    @ApiResponse(responseCode = "404", description = "No such product in this company")
    public ProductResponse getProduct(@PathVariable UUID id) {
        return service.get(currentUser.companyId(), id);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "createProduct", summary = "Create a product",
            description = "The GTIN is normalized to 14 digits and must be unique across all companies.")
    @ApiResponse(responseCode = "201", description = "Created")
    @ApiResponse(responseCode = "400", description = "Validation failed (e.g. GtinCheckDigit, FiberTotal)")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "409", description = "The GTIN is already taken")
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody ProductCreateRequest request) {
        ProductResponse created = service.create(currentUser.companyId(), request);
        return ResponseEntity.created(URI.create("/api/v1/products/" + created.id())).body(created);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @WriteAccess
    @Operation(operationId = "updateProduct", summary = "Change some fields of a product",
            description = "Missing fields stay unchanged; null clears sku, description and declaredFiberComposition.")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such product in this company")
    @ApiResponse(responseCode = "409", description = "GTIN taken, or GTIN change on a product with batches")
    public ProductResponse updateProduct(@PathVariable UUID id, @Valid @RequestBody ProductUpdateRequest request) {
        return service.update(currentUser.companyId(), id, request);
    }

    @DeleteMapping("/{id}")
    @WriteAccess
    @Operation(operationId = "deleteProduct", summary = "Delete a product without batches")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "403", description = "Read-only or supplier user")
    @ApiResponse(responseCode = "404", description = "No such product in this company")
    @ApiResponse(responseCode = "409", description = "The product has batches (reason PRODUCT_HAS_BATCHES)")
    public ResponseEntity<Void> deleteProduct(@PathVariable UUID id) {
        service.delete(currentUser.companyId(), id);
        return ResponseEntity.noContent().build();
    }
}
