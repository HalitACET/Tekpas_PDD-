package com.tekpas.product;

import com.tekpas.batch.BatchRepository;
import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.common.error.ProblemTypes;
import com.tekpas.common.persistence.Constraints;
import com.tekpas.common.web.PageResponse;
import com.tekpas.product.dto.ProductCreateRequest;
import com.tekpas.product.dto.ProductListItem;
import com.tekpas.product.dto.ProductResponse;
import com.tekpas.product.dto.ProductUpdateRequest;
import java.time.Clock;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

    /** V1: {@code gtin CHAR(14) NOT NULL UNIQUE} — unique across all companies, as GS1 intends. */
    static final String GTIN_UNIQUE = "product_gtin_key";

    /** Same text whoever owns the GTIN: the owner (maybe another company) is never named. */
    static final String GTIN_TAKEN = "A product with this GTIN already exists";

    private final ProductRepository products;
    private final BatchRepository batches;
    private final Clock clock;

    public ProductService(ProductRepository products, BatchRepository batches, Clock clock) {
        this.products = products;
        this.batches = batches;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductListItem> list(UUID companyId, @Nullable ProductCategory category, @Nullable String q,
            Pageable pageable) {
        return PageResponse.of(products.search(companyId, category, q, pageable));
    }

    @Transactional(readOnly = true)
    public ProductResponse get(UUID companyId, UUID id) {
        Product product = products.findByIdAndCompanyId(id, companyId).orElseThrow(ProductService::notFound);
        return toResponse(product, batches.countByProductId(id));
    }

    @Transactional
    public ProductResponse create(UUID companyId, ProductCreateRequest request) {
        Product product = new Product(companyId, Gtin.normalize(request.gtin()), request.name().trim(),
                request.category(), clock.instant());
        product.setSku(trimToNull(request.sku()));
        product.setDescription(trimToNull(request.description()));
        product.setDeclaredFiberComposition(request.declaredFiberComposition());
        saveAndFlush(product);
        return toResponse(product, 0);
    }

    @Transactional
    public ProductResponse update(UUID companyId, UUID id, ProductUpdateRequest request) {
        Product product = products.lockForUpdate(id, companyId).orElseThrow(ProductService::notFound);
        long batchCount = batches.countByProductId(id);

        if (request.gtin() != null) {
            String gtin = Gtin.normalize(request.gtin().orElseThrow());
            if (!gtin.equals(product.getGtin())) {
                if (batchCount > 0) {
                    throw ConflictException.state(ProblemTypes.GTIN_LOCKED, "GTIN_LOCKED",
                            "The GTIN cannot change once the product has batches");
                }
                product.setGtin(gtin);
            }
        }
        if (request.sku() != null) {
            product.setSku(trimToNull(request.sku().orElse(null)));
        }
        if (request.name() != null) {
            product.setName(request.name().orElseThrow().trim());
        }
        if (request.category() != null) {
            product.setCategory(request.category().orElseThrow());
        }
        if (request.description() != null) {
            product.setDescription(trimToNull(request.description().orElse(null)));
        }
        if (request.declaredFiberComposition() != null) {
            product.setDeclaredFiberComposition(request.declaredFiberComposition().orElse(null));
        }
        product.touch(clock.instant());
        saveAndFlush(product);
        return toResponse(product, batchCount);
    }

    @Transactional
    public void delete(UUID companyId, UUID id) {
        Product product = products.lockForUpdate(id, companyId).orElseThrow(ProductService::notFound);
        // batch.product_id cascades on delete: never remove a product together with its batches.
        if (batches.countByProductId(id) > 0) {
            throw ConflictException.state("PRODUCT_HAS_BATCHES", "A product with batches cannot be deleted");
        }
        products.delete(product);
    }

    private void saveAndFlush(Product product) {
        try {
            products.saveAndFlush(product);
        } catch (DataIntegrityViolationException e) {
            if (Constraints.violates(e, GTIN_UNIQUE)) {
                throw ConflictException.taken("gtin", GTIN_TAKEN);
            }
            throw e;
        }
    }

    static ProductResponse toResponse(Product p, long batchCount) {
        return new ProductResponse(p.getId(), p.getGtin(), p.getSku(), p.getName(), p.getCategory(),
                p.getDescription(), p.getDeclaredFiberComposition(), batchCount, p.getCreatedAt(), p.getUpdatedAt());
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Product not found");
    }

    private static @Nullable String trimToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
