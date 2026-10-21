package com.tekpas.company;

import com.tekpas.common.error.ConflictException;
import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.common.web.PageResponse;
import com.tekpas.company.dto.SupplierCertificate;
import com.tekpas.company.dto.SupplierCreateRequest;
import com.tekpas.company.dto.SupplierResponse;
import com.tekpas.company.dto.SupplierUpdateRequest;
import com.tekpas.document.DocType;
import com.tekpas.supplychain.StepStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The supplier network of a manufacturer ({@code company_supplier}). A supplier is a company; one created here
 * has no users and remembers its creator. Everything is read through the current company's links, so another
 * manufacturer's suppliers are never visible (404).
 */
@Service
public class SupplierService {

    /** Company types a supplier can have (design 15: İplik, Kumaş, Boyahane, Konfeksiyon, Aksesuar). */
    public static final Set<CompanyType> SUPPLIER_TYPES = EnumSet.of(CompanyType.YARN, CompanyType.FABRIC,
            CompanyType.DYEHOUSE, CompanyType.SEWING, CompanyType.ACCESSORY);

    /** API sort field → SQL expression. */
    public static final Map<String, String> SORT_FIELDS = Map.of("name", "name", "city", "city",
            "linkedAt", "linkedAt");
    private static final Map<String, String> SORT_SQL = Map.of("name", "lower(c.name)", "city", "lower(c.city)",
            "linkedAt", "cs.created_at");

    private static final String FROM = """
            FROM company_supplier cs JOIN company c ON c.id = cs.supplier_id
            WHERE cs.manufacturer_id = :me
              AND (CAST(:type AS varchar) IS NULL OR c.type = :type)
              AND (CAST(:q AS varchar) IS NULL OR c.name ILIKE :q ESCAPE '\\' OR c.city ILIKE :q ESCAPE '\\')
              AND (CAST(:id AS uuid) IS NULL OR c.id = :id)
            """;

    private static final String SELECT = """
            SELECT c.id, c.name, c.type, c.city, cs.phone, cs.contact_name, cs.created_at AS linked_at,
                   (c.created_by_company_id = :me
                    AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.company_id = c.id)) AS editable,
                   (SELECT count(DISTINCT s.batch_id) FROM supply_step s JOIN batch b ON b.id = s.batch_id
                    WHERE s.supplier_company_id = c.id AND b.company_id = :me) AS batch_count,
                   (SELECT s.status FROM supply_step s JOIN batch b ON b.id = s.batch_id
                    WHERE s.supplier_company_id = c.id AND b.company_id = :me
                    ORDER BY s.updated_at DESC, s.id LIMIT 1) AS latest_status,
                   (SELECT s.updated_at FROM supply_step s JOIN batch b ON b.id = s.batch_id
                    WHERE s.supplier_company_id = c.id AND b.company_id = :me
                    ORDER BY s.updated_at DESC, s.id LIMIT 1) AS latest_at
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final CompanyRepository companies;
    private final Clock clock;

    public SupplierService(NamedParameterJdbcTemplate jdbc, CompanyRepository companies, Clock clock) {
        this.jdbc = jdbc;
        this.companies = companies;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<SupplierResponse> list(UUID companyId, @Nullable CompanyType type, @Nullable String q,
            Pageable pageable) {
        Map<String, Object> params = params(companyId, type, q, null);
        Long total = jdbc.queryForObject("SELECT count(*) " + FROM, params, Long.class);
        String order = pageable.getSort().stream()
                .map(o -> SORT_SQL.getOrDefault(o.getProperty(), "c.id") + (o.isAscending() ? " ASC" : " DESC"))
                .collect(Collectors.joining(", "));
        params.put("limit", pageable.getPageSize());
        params.put("offset", pageable.getOffset());
        List<SupplierResponse> content = jdbc.query(
                SELECT + FROM + " ORDER BY " + order + ", c.id LIMIT :limit OFFSET :offset", params, SupplierService::row);
        content = withCertificates(companyId, content);
        long count = total == null ? 0 : total;
        int pages = (int) ((count + pageable.getPageSize() - 1) / pageable.getPageSize());
        return new PageResponse<>(content, pageable.getPageNumber(), pageable.getPageSize(), count, pages);
    }

    @Transactional(readOnly = true)
    public SupplierResponse get(UUID companyId, UUID supplierId) {
        return find(companyId, supplierId).orElseThrow(SupplierService::notFound);
    }

    /** The supplier company if it is in the current company's network. */
    @Transactional(readOnly = true)
    public Optional<Company> linked(UUID companyId, UUID supplierId) {
        return isLinked(companyId, supplierId) ? companies.findById(supplierId) : Optional.empty();
    }

    @Transactional
    public SupplierResponse create(UUID companyId, SupplierCreateRequest request) {
        requireSupplierType(request.type());
        Company supplier = companies.saveAndFlush(
                Company.supplier(request.name().trim(), request.type(), request.city().trim(), companyId));
        jdbc.update("""
                INSERT INTO company_supplier (manufacturer_id, supplier_id, phone, contact_name)
                VALUES (:me, :supplier, :phone, :contact)
                """, link(companyId, supplier.getId(), nullable(request.phone()), nullable(request.contactName())));
        return get(companyId, supplier.getId());
    }

    @Transactional
    public SupplierResponse update(UUID companyId, UUID supplierId, SupplierUpdateRequest request) {
        SupplierResponse current = get(companyId, supplierId);
        Company company = companies.findById(supplierId).orElseThrow(SupplierService::notFound);

        boolean renames = request.name() != null && !request.name().orElseThrow().trim().equals(company.getName());
        boolean retypes = request.type() != null && request.type().orElseThrow() != company.getType();
        boolean moves = request.city() != null && !request.city().orElseThrow().trim().equals(company.getCity());
        if ((renames || retypes || moves) && !current.editable()) {
            throw ConflictException.state("SUPPLIER_NOT_EDITABLE",
                    "Only the company that created a supplier without users can change its name, type or city");
        }
        if (retypes) {
            requireSupplierType(request.type().orElseThrow());
            if (current.batchCount() > 0) {
                // Steps were assigned by type; a yarn spinner cannot become a dyehouse under them.
                throw ConflictException.state("SUPPLIER_TYPE_IN_USE",
                        "The supplier is used in a supply chain, so its type cannot change");
            }
            company.changeType(request.type().orElseThrow());
        }
        if (renames) {
            company.rename(request.name().orElseThrow().trim());
        }
        if (moves) {
            company.moveTo(request.city().orElseThrow().trim());
        }
        companies.saveAndFlush(company);
        if (request.phone() != null) {
            jdbc.update("UPDATE company_supplier SET phone = :phone WHERE manufacturer_id = :me AND supplier_id = :supplier",
                    link(companyId, supplierId, nullable(request.phone().orElse(null)), null));
        }
        if (request.contactName() != null) {
            jdbc.update("""
                    UPDATE company_supplier SET contact_name = :contact WHERE manufacturer_id = :me AND supplier_id = :supplier
                    """, link(companyId, supplierId, null, nullable(request.contactName().orElse(null))));
        }
        return get(companyId, supplierId);
    }

    /**
     * Removes the supplier from the network. A supplier used in one of the company's chains stays (409). A company
     * that only existed for this link (created here, no users, no other links, no steps) is deleted with it.
     */
    @Transactional
    public void remove(UUID companyId, UUID supplierId) {
        SupplierResponse current = get(companyId, supplierId);
        if (current.batchCount() > 0) {
            throw ConflictException.state("SUPPLIER_IN_USE", "The supplier is used in a supply chain");
        }
        Map<String, Object> ids = Map.of("me", companyId, "supplier", supplierId);
        jdbc.update("DELETE FROM company_supplier WHERE manufacturer_id = :me AND supplier_id = :supplier", ids);
        jdbc.update("""
                DELETE FROM company c
                WHERE c.id = :supplier AND c.created_by_company_id = :me
                  AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.company_id = c.id)
                  AND NOT EXISTS (SELECT 1 FROM company_supplier cs WHERE cs.supplier_id = c.id)
                  AND NOT EXISTS (SELECT 1 FROM supply_step s WHERE s.supplier_company_id = c.id)
                """, ids);
    }

    private boolean isLinked(UUID companyId, UUID supplierId) {
        Boolean linked = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM company_supplier WHERE manufacturer_id = :me AND supplier_id = :supplier)
                """, Map.of("me", companyId, "supplier", supplierId), Boolean.class);
        return Boolean.TRUE.equals(linked);
    }

    private Optional<SupplierResponse> find(UUID companyId, UUID supplierId) {
        return withCertificates(companyId,
                jdbc.query(SELECT + FROM, params(companyId, null, null, supplierId), SupplierService::row)).stream()
                .findFirst();
    }

    /**
     * Adds what each supplier's confirmed certificates say (design v0.5 61), in one query for the whole page. Only
     * documents the current company confirmed on steps of its own batches count; a document nobody confirmed is not
     * a certificate yet.
     */
    private List<SupplierResponse> withCertificates(UUID companyId, List<SupplierResponse> suppliers) {
        if (suppliers.isEmpty()) {
            return suppliers;
        }
        Map<UUID, List<SupplierCertificate>> bySupplier = new HashMap<>();
        LocalDate today = LocalDate.now(clock);
        jdbc.query("""
                SELECT s.supplier_company_id AS supplier_id, d.doc_type, max(d.valid_until) AS valid_until
                FROM document d JOIN supply_step s ON s.id = d.step_id
                WHERE d.company_id = :me AND d.review_status = 'VERIFIED' AND d.valid_until IS NOT NULL
                  AND d.doc_type IN (:types) AND s.supplier_company_id IN (:suppliers)
                GROUP BY s.supplier_company_id, d.doc_type
                """, Map.of("me", companyId,
                        "types", java.util.Arrays.stream(DocType.values()).filter(DocType::isCertificate)
                                .map(Enum::name).toList(),
                        "suppliers", suppliers.stream().map(SupplierResponse::id).toList()),
                rs -> {
                    LocalDate until = rs.getObject("valid_until", LocalDate.class);
                    bySupplier.computeIfAbsent(rs.getObject("supplier_id", UUID.class), k -> new ArrayList<>())
                            .add(new SupplierCertificate(DocType.valueOf(rs.getString("doc_type")), until,
                                    until.isBefore(today)));
                });
        return suppliers.stream().map(r -> {
            List<SupplierCertificate> own = new ArrayList<>(bySupplier.getOrDefault(r.id(), List.of()));
            own.sort(java.util.Comparator.comparing(SupplierCertificate::type));
            return new SupplierResponse(r.id(), r.name(), r.type(), r.city(), r.phone(), r.contactName(), r.batchCount(),
                    r.latestStepStatus(), r.latestStepAt(), r.editable(), r.linkedAt(), own);
        }).toList();
    }

    private static Map<String, Object> params(UUID companyId, @Nullable CompanyType type, @Nullable String q,
            @Nullable UUID id) {
        Map<String, Object> params = new HashMap<>();
        params.put("me", companyId);
        params.put("type", type == null ? null : type.name());
        params.put("q", q);
        params.put("id", id);
        return params;
    }

    private static Map<String, Object> link(UUID companyId, UUID supplierId, @Nullable String phone,
            @Nullable String contact) {
        Map<String, Object> params = new HashMap<>();
        params.put("me", companyId);
        params.put("supplier", supplierId);
        params.put("phone", phone);
        params.put("contact", contact);
        return params;
    }

    private static SupplierResponse row(ResultSet rs, int i) throws SQLException {
        String status = rs.getString("latest_status");
        return new SupplierResponse(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                CompanyType.valueOf(rs.getString("type")),
                rs.getString("city"),
                rs.getString("phone"),
                rs.getString("contact_name"),
                rs.getLong("batch_count"),
                status == null ? null : StepStatus.valueOf(status),
                rs.getTimestamp("latest_at") == null ? null : rs.getTimestamp("latest_at").toInstant(),
                rs.getBoolean("editable"),
                rs.getTimestamp("linked_at").toInstant(),
                List.of());
    }

    private static void requireSupplierType(CompanyType type) {
        if (!SUPPLIER_TYPES.contains(type)) {
            throw new InvalidFieldsException(new FieldViolation("type", "SupplierType",
                    "A supplier is one of " + SUPPLIER_TYPES));
        }
    }

    private static @Nullable String nullable(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Supplier not found");
    }

    /** Default order of the list: by name. */
    public static Sort defaultSort() {
        return Sort.by(Sort.Order.asc("name"));
    }
}
