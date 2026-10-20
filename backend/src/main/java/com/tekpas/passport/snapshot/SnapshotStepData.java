package com.tekpas.passport.snapshot;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.supplychain.ChemicalStandard;
import com.tekpas.supplychain.DyeProcess;
import com.tekpas.supplychain.EnergyShare;
import com.tekpas.supplychain.YarnProcess;
import java.math.BigDecimal;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * The public part of a step's data (docs/m6-plan.md §3.2): fibre, origin, energy, water, dyeing, fabric. Quantities
 * (quantityKg, deliveredKg), harvest year and shade are not in the list and never get here.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SnapshotStepData(
        @Nullable Fiber fiberType,
        @Nullable String originCountry,
        @Nullable String originRegion,
        @Nullable List<FiberShare> fiberComposition,
        @Nullable List<EnergyShare> energySources,
        @Nullable BigDecimal energyKwhPerKg,
        @Nullable BigDecimal energyKwhPerPiece,
        @Nullable String yarnCount,
        @Nullable YarnProcess yarnProcess,
        @Nullable String fabricType,
        @Nullable BigDecimal gsm,
        @Nullable DyeProcess dyeProcess,
        @Nullable String dyeProcessOther,
        @Nullable List<ChemicalStandard> chemicalStandards,
        @Nullable BigDecimal waterLPerKg) {
}
