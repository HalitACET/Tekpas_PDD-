package com.tekpas.product;

import com.tekpas.product.dto.ProductListItem;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Every query takes the company id: a product of another company is simply not found. */
public interface ProductRepository extends JpaRepository<Product, UUID> {

    Optional<Product> findByIdAndCompanyId(UUID id, UUID companyId);

    /** FOR UPDATE: product changes that depend on "has no batches" (delete, GTIN change). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id and p.companyId = :companyId")
    Optional<Product> lockForUpdate(UUID id, UUID companyId);

    /** FOR SHARE: creating a batch, so that the product cannot be deleted (cascading the batch) meanwhile. */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select p from Product p where p.id = :id and p.companyId = :companyId")
    Optional<Product> lockForShare(UUID id, UUID companyId);

    /**
     * @param q a LIKE pattern from {@code PageQuery.containsPattern}, matched against name, SKU and GTIN
     */
    @Query(value = """
            select new com.tekpas.product.dto.ProductListItem(p.id, p.gtin, p.sku, p.name, p.category,
                p.declaredFiberComposition,
                (select count(b) from Batch b where b.productId = p.id), p.createdAt, p.updatedAt)
            from Product p
            where p.companyId = :companyId
              and (:category is null or p.category = :category)
              and (:q is null or p.name ilike :q escape '\\' or p.sku ilike :q escape '\\'
                   or p.gtin like :q escape '\\')
            """,
            countQuery = """
            select count(p) from Product p
            where p.companyId = :companyId
              and (:category is null or p.category = :category)
              and (:q is null or p.name ilike :q escape '\\' or p.sku ilike :q escape '\\'
                   or p.gtin like :q escape '\\')
            """)
    Page<ProductListItem> search(UUID companyId, @Nullable ProductCategory category, @Nullable String q,
            Pageable pageable);
}
