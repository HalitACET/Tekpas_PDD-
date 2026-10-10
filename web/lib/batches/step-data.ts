import type { components } from "@tekpas/api-client";
import type { Fiber, StepType } from "@tekpas/shared";
import { fiberText, formatPercent } from "@/lib/format";

type StepData = components["schemas"]["StepData"];
type EnergySource = components["schemas"]["EnergySource"];
type YarnProcess = components["schemas"]["YarnProcess"];

/*
 * "Tedarikçinin girdiği veriler" of the step panel (design v0.3 10, v0.3.1 30): which StepData fields a step
 * type shows, in the design's order (YARN and DYEING as there; the others follow the API's fields per type,
 * backend StepData.FIELDS). A missing value is null; the panel shows "—".
 */

export type StepField =
  | "fiberType"
  | "originRegion"
  | "originCountry"
  | "harvestYear"
  | "quantityKg"
  | "fiberComposition"
  | "fabric"
  | "energySources"
  | "energyUse"
  | "delivered"
  | "process"
  | "chemicalCompliance"
  | "waterLPerKg";

const FIELDS: Record<StepType, StepField[]> = {
  FIBER: ["fiberType", "originRegion", "originCountry", "harvestYear", "quantityKg"],
  YARN: ["fiberComposition", "originCountry", "energySources", "energyUse", "delivered"],
  FABRIC: ["fiberComposition", "fabric", "originCountry", "energySources", "energyUse", "delivered"],
  DYEING: ["process", "chemicalCompliance", "energySources", "energyUse", "waterLPerKg"],
  SEWING: ["originCountry", "energySources", "energyUse"],
  ACCESSORY: ["originCountry", "energySources"],
  PACKAGING: ["originCountry", "energySources"],
};

export interface StepDataText {
  fiber: (fiber: Fiber) => string;
  energySource: (source: EnergySource) => string;
  yarnProcess: (process: YarnProcess) => string;
  country: (code: string) => string;
  unit: (unit: "kg" | "kwhPerKg" | "kwhPerPiece" | "lPerKg" | "gsm", value: string) => string;
}

export function stepDataRows(
  type: StepType,
  data: StepData,
  locale: string,
  text: StepDataText,
): { field: StepField; value: string | null }[] {
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const joined = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

  const value = (field: StepField): string | null => {
    switch (field) {
      case "fiberType":
        return data.fiberType ? text.fiber(data.fiberType) : null;
      case "originRegion":
        return data.originRegion ?? null;
      case "originCountry":
        return data.originCountry ? text.country(data.originCountry) : null;
      case "harvestYear":
        return data.harvestYear != null ? String(data.harvestYear) : null;
      case "quantityKg":
        return data.quantityKg != null ? text.unit("kg", number(data.quantityKg)) : null;
      case "fiberComposition":
        return data.fiberComposition?.length ? fiberText(data.fiberComposition, locale, text.fiber) : null;
      case "fabric":
        return joined([data.fabricType, data.gsm != null ? text.unit("gsm", number(data.gsm)) : null]);
      case "energySources":
        return data.energySources?.length
          ? data.energySources.map((e) => `${text.energySource(e.source)} ${formatPercent(e.percent, locale)}`).join(" · ")
          : null;
      case "energyUse":
        if (type === "SEWING") {
          return data.energyKwhPerPiece != null ? text.unit("kwhPerPiece", number(data.energyKwhPerPiece)) : null;
        }
        return data.energyKwhPerKg != null ? text.unit("kwhPerKg", number(data.energyKwhPerKg)) : null;
      case "delivered":
        // "640 kg · Ne 30/1 karde" (10)
        return joined([
          data.deliveredKg != null ? text.unit("kg", number(data.deliveredKg)) : null,
          [data.yarnCount, data.yarnProcess ? text.yarnProcess(data.yarnProcess) : null].filter(Boolean).join(" "),
        ]);
      case "process":
        return data.process ?? null;
      case "chemicalCompliance":
        return data.chemicalCompliance ?? null;
      case "waterLPerKg":
        return data.waterLPerKg != null ? text.unit("lPerKg", number(data.waterLPerKg)) : null;
    }
  };

  return FIELDS[type].map((field) => ({ field, value: value(field) }));
}
