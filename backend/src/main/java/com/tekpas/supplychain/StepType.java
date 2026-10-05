package com.tekpas.supplychain;

import com.tekpas.company.CompanyType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Supply chain step types (V1 {@code chk_step_type}). The design's chain has five columns: FIBER → YARN → FABRIC
 * → DYEING → SEWING; ACCESSORY and PACKAGING exist in the API but are not drawn yet.
 */
@Schema(enumAsRef = true)
public enum StepType {
    FIBER(null),
    YARN(CompanyType.YARN),
    FABRIC(CompanyType.FABRIC),
    DYEING(CompanyType.DYEHOUSE),
    SEWING(CompanyType.SEWING),
    ACCESSORY(CompanyType.ACCESSORY),
    PACKAGING(CompanyType.ACCESSORY);

    /** The default chain of a product's first batch, in order (each step uses the previous one's output). */
    public static final List<StepType> DEFAULT_CHAIN = List.of(FIBER, YARN, FABRIC, DYEING, SEWING);

    private final @Nullable CompanyType supplierType;

    StepType(@Nullable CompanyType supplierType) {
        this.supplierType = supplierType;
    }

    /** The supplier type that can be assigned; null for FIBER, which records an origin, not a company. */
    public @Nullable CompanyType supplierType() {
        return supplierType;
    }
}
