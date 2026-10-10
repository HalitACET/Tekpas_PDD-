package com.tekpas.supplychain;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.product.validation.FiberDuplicate;
import com.tekpas.product.validation.FiberTotal;
import com.tekpas.supplychain.validation.EnergyDuplicate;
import com.tekpas.supplychain.validation.EnergyTotal;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.jspecify.annotations.Nullable;

/**
 * What a supplier declares for a step (design 10, "Tedarikçinin girdiği veriler"), stored as JSONB. One record
 * for all step types: each field belongs to the types listed in {@link #FIELDS}; a field sent for another type
 * is a field error (code NotApplicable). Measurements are decimals (kWh/kg, L/kg, g/m², kg), percentages
 * whole numbers; fiber and energy shares add up to 100.
 *
 * @param fiberType FIBER: the fiber of the lot, e.g. ORGANIC_COTTON
 * @param originCountry ISO 3166-1 alpha-2, e.g. TR
 * @param originRegion FIBER: e.g. "Harran, Şanlıurfa"
 * @param quantityKg FIBER: lot size in kg
 * @param energyKwhPerKg YARN, FABRIC: energy use per kg of output
 * @param energyKwhPerPiece SEWING: energy use per garment
 * @param deliveredKg YARN, FABRIC: delivered to the next step; DYEING: processed ("İşlenen miktar"), in kg
 * @param yarnCount YARN: e.g. "Ne 30/1"
 * @param fabricType FABRIC: e.g. "Süprem"
 * @param gsm FABRIC: grams per m²
 * @param dyeProcess DYEING: the process (design v0.4 41)
 * @param dyeProcessOther DYEING: required when {@code dyeProcess} is OTHER, otherwise not set
 * @param shade DYEING: colour or shade, e.g. "Ekru"
 * @param chemicalStandards DYEING: all that apply; NONE alone means "none of these"
 * @param waterLPerKg DYEING: water use per kg
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
// Data written before a field was renamed (V6: process, chemicalCompliance) must still read.
@JsonIgnoreProperties(ignoreUnknown = true)
public record StepData(
        @Nullable Fiber fiberType,
        @Schema(example = "TR") @Nullable @Pattern(regexp = "^[A-Z]{2}$") String originCountry,
        @Nullable @Size(max = 100) String originRegion,
        @Nullable @Min(1900) @Max(2100) Integer harvestYear,
        @Nullable @Positive @Digits(integer = 9, fraction = 3) BigDecimal quantityKg,
        @Nullable @Valid @FiberTotal @FiberDuplicate List<FiberShare> fiberComposition,
        @Nullable @Valid @EnergyTotal @EnergyDuplicate List<EnergyShare> energySources,
        @Nullable @Positive @Digits(integer = 6, fraction = 3) BigDecimal energyKwhPerKg,
        @Nullable @Positive @Digits(integer = 6, fraction = 3) BigDecimal energyKwhPerPiece,
        @Nullable @Positive @Digits(integer = 9, fraction = 3) BigDecimal deliveredKg,
        @Schema(example = "Ne 30/1") @Nullable @Size(max = 30) String yarnCount,
        @Nullable YarnProcess yarnProcess,
        @Nullable @Size(max = 100) String fabricType,
        @Nullable @Positive @Digits(integer = 5, fraction = 2) BigDecimal gsm,
        @Nullable DyeProcess dyeProcess,
        @Nullable @Size(max = 80) String dyeProcessOther,
        @Nullable @Size(max = 100) String shade,
        @Nullable List<ChemicalStandard> chemicalStandards,
        @Nullable @Positive @Digits(integer = 6, fraction = 3) BigDecimal waterLPerKg) {

    public static final StepData EMPTY = new StepData(null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null);

    private static final Set<StepType> FIBER = EnumSet.of(StepType.FIBER);
    private static final Set<StepType> MAKERS = EnumSet.of(StepType.YARN, StepType.FABRIC, StepType.DYEING,
            StepType.SEWING, StepType.ACCESSORY, StepType.PACKAGING);

    /** Field name → value → step types the field belongs to. */
    private static final Map<String, Field> FIELDS = Map.ofEntries(
            Map.entry("fiberType", new Field(StepData::fiberType, FIBER)),
            Map.entry("originCountry", new Field(StepData::originCountry, EnumSet.allOf(StepType.class))),
            Map.entry("originRegion", new Field(StepData::originRegion, FIBER)),
            Map.entry("harvestYear", new Field(StepData::harvestYear, FIBER)),
            Map.entry("quantityKg", new Field(StepData::quantityKg, FIBER)),
            Map.entry("fiberComposition", new Field(StepData::fiberComposition, EnumSet.of(StepType.YARN,
                    StepType.FABRIC))),
            Map.entry("energySources", new Field(StepData::energySources, MAKERS)),
            Map.entry("energyKwhPerKg", new Field(StepData::energyKwhPerKg, EnumSet.of(StepType.YARN,
                    StepType.FABRIC, StepType.DYEING))),
            Map.entry("energyKwhPerPiece", new Field(StepData::energyKwhPerPiece, EnumSet.of(StepType.SEWING))),
            Map.entry("deliveredKg", new Field(StepData::deliveredKg, EnumSet.of(StepType.YARN, StepType.FABRIC,
                    StepType.DYEING))),
            Map.entry("yarnCount", new Field(StepData::yarnCount, EnumSet.of(StepType.YARN))),
            Map.entry("yarnProcess", new Field(StepData::yarnProcess, EnumSet.of(StepType.YARN))),
            Map.entry("fabricType", new Field(StepData::fabricType, EnumSet.of(StepType.FABRIC))),
            Map.entry("gsm", new Field(StepData::gsm, EnumSet.of(StepType.FABRIC))),
            Map.entry("dyeProcess", new Field(StepData::dyeProcess, EnumSet.of(StepType.DYEING))),
            Map.entry("dyeProcessOther", new Field(StepData::dyeProcessOther, EnumSet.of(StepType.DYEING))),
            Map.entry("shade", new Field(StepData::shade, EnumSet.of(StepType.DYEING))),
            Map.entry("chemicalStandards", new Field(StepData::chemicalStandards, EnumSet.of(StepType.DYEING))),
            Map.entry("waterLPerKg", new Field(StepData::waterLPerKg, EnumSet.of(StepType.DYEING))));

    private record Field(Function<StepData, @Nullable Object> value, Set<StepType> types) {
    }

    /**
     * What the supplier must fill before submitting (PLAN M4): besides these, every field is optional. For a
     * list "filled" means at least one entry.
     */
    private static final Map<StepType, List<String>> REQUIRED = Map.of(
            StepType.YARN, List.of("fiberComposition", "originCountry"),
            StepType.FABRIC, List.of("fiberComposition", "fabricType"),
            StepType.DYEING, List.of("dyeProcess", "chemicalStandards"),
            StepType.SEWING, List.of("originCountry"));

    /** Field names a step type has (whitelist for the fields of a correction request). */
    public static List<String> fieldsOf(StepType type) {
        return FIELDS.entrySet().stream().filter(e -> e.getValue().types().contains(type)).map(Map.Entry::getKey)
                .sorted().toList();
    }

    /** Required fields of the step type that are empty, in the order of {@link #REQUIRED}. */
    public List<String> missingFor(StepType type) {
        return REQUIRED.getOrDefault(type, List.of()).stream().filter(name -> {
            Object value = FIELDS.get(name).value().apply(this);
            return value == null || (value instanceof String text && text.isBlank())
                    || (value instanceof List<?> list && list.isEmpty());
        }).toList();
    }

    /**
     * Rules between fields that bean validation cannot express per field, as (field, code) pairs:
     * {@code dyeProcessOther} NotBlank for OTHER and NotApplicable otherwise; {@code chemicalStandards}
     * Duplicate, and NoneExclusive when NONE comes with another standard.
     */
    public List<Map.Entry<String, String>> ruleViolations() {
        List<Map.Entry<String, String>> violations = new ArrayList<>();
        boolean other = dyeProcess == DyeProcess.OTHER;
        boolean described = dyeProcessOther != null && !dyeProcessOther.isBlank();
        if (other && !described) {
            violations.add(Map.entry("dyeProcessOther", "NotBlank"));
        } else if (!other && dyeProcessOther != null) {
            violations.add(Map.entry("dyeProcessOther", "NotApplicable"));
        }
        if (chemicalStandards != null) {
            if (new HashSet<>(chemicalStandards).size() < chemicalStandards.size()) {
                violations.add(Map.entry("chemicalStandards", "Duplicate"));
            } else if (chemicalStandards.contains(ChemicalStandard.NONE) && chemicalStandards.size() > 1) {
                violations.add(Map.entry("chemicalStandards", "NoneExclusive"));
            }
        }
        return violations;
    }

    /** Names of the fields that are set but do not belong to this step type, sorted. */
    public List<String> fieldsNotFor(StepType type) {
        List<String> wrong = new ArrayList<>();
        FIELDS.forEach((name, field) -> {
            if (field.value().apply(this) != null && !field.types().contains(type)) {
                wrong.add(name);
            }
        });
        wrong.sort(null);
        return wrong;
    }
}
