package com.tekpas.company.dto;

import com.tekpas.company.CompanyType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/**
 * Design 15 "Tedarikçi ekle". Creates a supplier company (without users) and links it to the current company.
 *
 * @param type YARN, FABRIC, DYEHOUSE, SEWING or ACCESSORY (field error SupplierType otherwise)
 * @param phone E.164, e.g. +902240000000; data request links can be shared to it via WhatsApp (M4)
 */
public record SupplierCreateRequest(
        @NotBlank @Size(max = 200) String name,
        @NotNull CompanyType type,
        @NotBlank @Size(max = 100) String city,
        @Schema(example = "+902240000000") @Nullable @Pattern(regexp = SupplierCreateRequest.E164) String phone) {

    public static final String E164 = "^\\+[1-9][0-9]{6,14}$";
}
