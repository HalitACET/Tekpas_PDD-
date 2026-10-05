package com.tekpas.company.dto;

import com.tekpas.company.CompanyType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Partial update. The phone belongs to the link and can always change ({@code null} clears it). Name, type and
 * city belong to the company: only its creator may change them, and only while the company has no users
 * (409 SUPPLIER_NOT_EDITABLE otherwise).
 */
public record SupplierUpdateRequest(
        @Nullable Optional<@NotBlank @Size(max = 200) String> name,
        @Nullable Optional<@NotNull CompanyType> type,
        @Nullable Optional<@NotBlank @Size(max = 100) String> city,
        @Nullable Optional<@Pattern(regexp = SupplierCreateRequest.E164) String> phone) {
}
