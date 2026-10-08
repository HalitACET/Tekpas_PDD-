package com.tekpas.supplychain;

import io.swagger.v3.oas.annotations.media.Schema;

/** Energy mix of a step (design 10: "Şebeke %60 · GES %40", "Doğalgaz %80 · GES %20"). */
@Schema(enumAsRef = true)
public enum EnergySource {
    GRID,
    SOLAR,
    WIND,
    NATURAL_GAS,
    COAL,
    BIOMASS,
    OTHER
}
