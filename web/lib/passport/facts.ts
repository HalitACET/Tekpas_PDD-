import type { components } from "@tekpas/api-client";
import type { Fiber } from "@tekpas/shared";
import { fiberText, formatPercent } from "@/lib/format";
import type { SnapshotStep } from "./types";

type EnergySource = components["schemas"]["EnergySource"];
type YarnProcess = components["schemas"]["YarnProcess"];
type DyeProcess = components["schemas"]["DyeProcess"];
type ChemicalStandard = components["schemas"]["ChemicalStandard"];

export interface Fact {
  key: string;
  label: string;
  value: string;
}

/** The words a fact is written with: enum labels, units and the row labels of the design (K in KozaPassPasaport). */
export interface FactText {
  fiber: (fiber: Fiber) => string;
  energySource: (source: EnergySource) => string;
  yarnProcess: (process: YarnProcess) => string;
  dyeProcess: (process: DyeProcess) => string;
  chemicalStandard: (standard: ChemicalStandard) => string;
  country: (code: string) => string;
  unit: (unit: "kwhPerKg" | "kwhPerPiece" | "lPerKg" | "gsm", value: string) => string;
  labels: {
    origin: string;
    yarn: string;
    fabric: string;
    composition: string;
    dye: string;
    chemical: string;
    energySource: string;
    energyUse: string;
    water: string;
  };
}

/**
 * What a step card says about its step (design v0.6): the public subset of the step's data, one row per thing that is
 * known, in the design's order. A step without a value for a row simply has no row (a consumer needs no "—").
 */
export function factsOf(step: SnapshotStep, locale: string, text: FactText): Fact[] {
  const d = step.data;
  if (!d) return [];
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value);
  const joined = (parts: (string | null | undefined)[], separator: string) =>
    parts.filter(Boolean).join(separator) || null;
  const rows: Fact[] = [];
  const add = (key: string, label: string, value: string | null | undefined) => {
    if (value) rows.push({ key, label, value });
  };

  const origin = joined([d.originCountry ? text.country(d.originCountry) : null, d.originRegion], " · ");
  const composition = d.fiberComposition?.length ? fiberText(d.fiberComposition, locale, text.fiber) : null;
  const energySources = d.energySources?.length
    ? d.energySources.map((e) => `${text.energySource(e.source)} ${formatPercent(e.percent, locale)}`).join(" · ")
    : null;
  const energyUse =
    step.type === "SEWING"
      ? d.energyKwhPerPiece != null
        ? text.unit("kwhPerPiece", number(d.energyKwhPerPiece))
        : null
      : d.energyKwhPerKg != null
        ? text.unit("kwhPerKg", number(d.energyKwhPerKg))
        : null;

  switch (step.type) {
    case "FIBER":
      add("origin", text.labels.origin, origin);
      break;
    case "YARN":
      add("yarn", text.labels.yarn, joined([d.yarnCount, d.yarnProcess ? text.yarnProcess(d.yarnProcess) : null], " "));
      add("composition", text.labels.composition, composition);
      add("origin", text.labels.origin, origin);
      add("energySource", text.labels.energySource, energySources);
      add("energyUse", text.labels.energyUse, energyUse);
      break;
    case "FABRIC":
      add("fabric", text.labels.fabric, joined([d.fabricType, d.gsm != null ? text.unit("gsm", number(d.gsm)) : null], " · "));
      add("composition", text.labels.composition, composition);
      add("origin", text.labels.origin, origin);
      add("energySource", text.labels.energySource, energySources);
      add("energyUse", text.labels.energyUse, energyUse);
      break;
    case "DYEING":
      add("dye", text.labels.dye, d.dyeProcess === "OTHER" && d.dyeProcessOther ? d.dyeProcessOther : d.dyeProcess ? text.dyeProcess(d.dyeProcess) : null);
      add("chemical", text.labels.chemical, d.chemicalStandards?.length ? d.chemicalStandards.map(text.chemicalStandard).join(" · ") : null);
      add("energySource", text.labels.energySource, energySources);
      add("water", text.labels.water, d.waterLPerKg != null ? text.unit("lPerKg", number(d.waterLPerKg)) : null);
      break;
    default:
      add("origin", text.labels.origin, origin);
      add("energySource", text.labels.energySource, energySources);
      add("energyUse", text.labels.energyUse, energyUse);
  }
  return rows;
}
