import type {
  ChemicalStandard,
  DyeProcess,
  EnergySource,
  Fiber,
  StepType,
  YarnProcess,
} from "@tekpas/shared";
import { z } from "zod";
import type { StepData } from "@/lib/api/batches";

/*
 * The supplier's form (design v0.4 40, 41, 45) and what it sends: POST /public/request/submit. Texts typed by
 * the supplier stay text ("3,4", "1.150"); parseDecimal turns them into numbers. The rules are the API's
 * (StepData, PLAN M4), plus the design's: a sender's name of at least three letters, "30/1" for a yarn count.
 */

/** The blocks of the form, in the order the design shows them (01, 02, …); Belgeler and Gönderen follow. */
export type SectionId = "fibers" | "origin" | "energy" | "delivery" | "fabric" | "dye" | "quantity";

/** Step type → sections. YARN is design 40, DYEING design 41; the others use the same pieces (design debt). */
export function sectionsFor(type: StepType): SectionId[] {
  switch (type) {
    case "YARN":
      return ["fibers", "energy", "delivery"];
    case "FABRIC":
      return ["fibers", "energy", "fabric"];
    case "DYEING":
      return ["dye", "quantity", "energy"];
    default:
      return ["origin", "energy"];
  }
}

/** The API's field names each section holds: the correction request (45) marks sections by these. */
export const SECTION_FIELDS: Record<SectionId, readonly string[]> = {
  fibers: ["fiberComposition", "originCountry"],
  origin: ["originCountry"],
  energy: ["energySources", "energyKwhPerKg", "energyKwhPerPiece"],
  delivery: ["deliveredKg", "yarnCount", "yarnProcess"],
  fabric: ["fabricType", "gsm", "deliveredKg"],
  dye: ["dyeProcess", "dyeProcessOther", "shade", "chemicalStandards"],
  quantity: ["deliveredKg", "waterLPerKg"],
};

/** Steps whose energy is told per kg of output, or per garment. */
const KWH_PER_KG: readonly StepType[] = ["YARN", "FABRIC", "DYEING"];

export function energyUnit(type: StepType): "KWH_PER_KG" | "KWH_PER_PIECE" | undefined {
  if (KWH_PER_KG.includes(type)) return "KWH_PER_KG";
  return type === "SEWING" ? "KWH_PER_PIECE" : undefined;
}

export interface SubmissionValues {
  fibers: { fiber: Fiber; percent: string }[];
  originCountry: string;
  energy: { source: EnergySource; percent: string }[];
  energyKwhPerKg: string;
  energyKwhPerPiece: string;
  deliveredKg: string;
  /** Without the "Ne" the design shows in front of the field: "30/1". */
  yarnCount: string;
  yarnProcess: YarnProcess | "";
  fabricType: string;
  gsm: string;
  dyeProcess: DyeProcess | "";
  dyeProcessOther: string;
  shade: string;
  chemicalStandards: ChemicalStandard[];
  waterLPerKg: string;
  submitterName: string;
  submitterRole: string;
}

export function emptyValues(): SubmissionValues {
  return {
    fibers: [{ fiber: "COTTON", percent: "" }],
    originCountry: "",
    energy: [{ source: "GRID", percent: "" }],
    energyKwhPerKg: "",
    energyKwhPerPiece: "",
    deliveredKg: "",
    yarnCount: "",
    yarnProcess: "",
    fabricType: "",
    gsm: "",
    dyeProcess: "",
    dyeProcessOther: "",
    shade: "",
    chemicalStandards: [],
    waterLPerKg: "",
    submitterName: "",
    submitterRole: "",
  };
}

/** "3.4" → "3,4": numbers are shown the way the design types them. */
export function decimalText(value: number | string | null | undefined): string {
  return value == null ? "" : String(value).replace(".", ",");
}

/** The previous submission (45) filled back into the form; the sender stays empty (the API does not return it). */
export function valuesFrom(data: StepData | undefined): SubmissionValues {
  const values = emptyValues();
  if (!data) return values;
  if (data.fiberComposition?.length) {
    values.fibers = data.fiberComposition.map((s) => ({ fiber: s.fiber, percent: String(s.percent) }));
  }
  if (data.energySources?.length) {
    values.energy = data.energySources.map((s) => ({ source: s.source, percent: String(s.percent) }));
  }
  values.originCountry = data.originCountry ?? "";
  values.energyKwhPerKg = decimalText(data.energyKwhPerKg);
  values.energyKwhPerPiece = decimalText(data.energyKwhPerPiece);
  values.deliveredKg = decimalText(data.deliveredKg);
  values.yarnCount = (data.yarnCount ?? "").replace(/^Ne\s*/i, "");
  values.yarnProcess = data.yarnProcess ?? "";
  values.fabricType = data.fabricType ?? "";
  values.gsm = decimalText(data.gsm);
  values.dyeProcess = data.dyeProcess ?? "";
  values.dyeProcessOther = data.dyeProcessOther ?? "";
  values.shade = data.shade ?? "";
  values.chemicalStandards = data.chemicalStandards ?? [];
  values.waterLPerKg = decimalText(data.waterLPerKg);
  return values;
}

/**
 * "3,4" → 3.4, "1.150" → 1150 (a dot before exactly three digits is a thousands separator), "62.5" → 62.5,
 * "" → undefined, anything else → NaN.
 */
export function parseDecimal(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  let normal = trimmed;
  if (trimmed.includes(",")) normal = trimmed.replace(/\./g, "").replace(",", ".");
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(trimmed)) normal = trimmed.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

/** Whole percent as typed: "80" → 80, "" → undefined, "80,5" or "x" → NaN. */
export function parsePercent(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Sum of the lines that hold a number (the "Toplam %95" pill). */
export function shareTotal(rows: ReadonlyArray<{ percent: string }>): number {
  return rows.reduce((sum, row) => {
    const n = parsePercent(row.percent);
    return sum + (n !== undefined && Number.isFinite(n) ? n : 0);
  }, 0);
}

/** An energy mix that was left alone (no percent typed) is not sent. */
function energyFilled(rows: ReadonlyArray<{ percent: string }>): boolean {
  return rows.some((row) => row.percent.trim() !== "");
}

/** Messages of the schema are error codes: the API's field codes, and the design's own for these. */
export const SUPPLIER_ERROR_CODES = [
  "OriginRequired",
  "YarnCount",
  "FabricType",
  "DyeProcess",
  "DyeProcessOther",
  "Chemicals",
  "NameRequired",
  "NameShort",
] as const;
export type SupplierErrorCode = (typeof SUPPLIER_ERROR_CODES)[number];

const NE_PATTERN = /^\d{1,3}\/\d{1,2}$/;

/**
 * What the form checks before sending, per step type. Group errors (the shares' total) sit under
 * "fibersGroup" and "energyGroup", so they do not mix with the errors of single rows.
 */
export function submissionSchema(type: StepType) {
  const sections = sectionsFor(type);
  const has = (section: SectionId) => sections.includes(section);
  const perKg = energyUnit(type) === "KWH_PER_KG";
  const perPiece = energyUnit(type) === "KWH_PER_PIECE";

  return z
    .object({
      fibers: z.array(z.object({ fiber: z.string(), percent: z.string() })),
      originCountry: z.string(),
      energy: z.array(z.object({ source: z.string(), percent: z.string() })),
      energyKwhPerKg: z.string(),
      energyKwhPerPiece: z.string(),
      deliveredKg: z.string(),
      yarnCount: z.string(),
      yarnProcess: z.string(),
      fabricType: z.string(),
      gsm: z.string(),
      dyeProcess: z.string(),
      dyeProcessOther: z.string(),
      shade: z.string(),
      chemicalStandards: z.array(z.string()),
      waterLPerKg: z.string(),
      submitterName: z.string(),
      submitterRole: z.string(),
    })
    .superRefine((v, ctx) => {
      const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

      const checkShares = (key: "fibers" | "energy", rows: { percent: string }[], kinds: string[], total: string) => {
        let rowFailed = false;
        rows.forEach((row, i) => {
          const n = parsePercent(row.percent);
          if (n === undefined) fail([key, i, "percent"], "NotNull");
          else if (!Number.isInteger(n)) fail([key, i, "percent"], "Integer");
          else if (n < 1) fail([key, i, "percent"], "Min");
          else if (n > 100) fail([key, i, "percent"], "Max");
          else return;
          rowFailed = true;
        });
        if (new Set(kinds).size < kinds.length) fail([`${key}Group`], key === "fibers" ? "FiberDuplicate" : "EnergyDuplicate");
        else if (!rowFailed && shareTotal(rows) !== 100) fail([`${key}Group`], total);
      };

      if (has("fibers")) {
        checkShares("fibers", v.fibers, v.fibers.map((r) => r.fiber), "FiberTotal");
      }
      if ((type === "YARN" || type === "SEWING") && v.originCountry === "") fail(["originCountry"], "OriginRequired");
      if (has("energy") && energyFilled(v.energy)) {
        checkShares("energy", v.energy, v.energy.map((r) => r.source), "EnergyTotal");
      }

      const positive = (key: keyof SubmissionValues, applies: boolean) => {
        if (!applies) return;
        const n = parseDecimal(String(v[key]));
        if (n !== undefined && !(n > 0)) fail([key], "Positive");
      };
      positive("energyKwhPerKg", has("energy") && perKg);
      positive("energyKwhPerPiece", has("energy") && perPiece);
      positive("deliveredKg", has("delivery") || has("fabric") || has("quantity"));
      positive("gsm", has("fabric"));
      positive("waterLPerKg", has("quantity"));

      if (has("delivery") && v.yarnCount.trim() !== "" && !NE_PATTERN.test(v.yarnCount.trim())) fail(["yarnCount"], "YarnCount");
      if (has("fabric")) {
        if (v.fabricType.trim() === "") fail(["fabricType"], "FabricType");
        else if (v.fabricType.trim().length > 100) fail(["fabricType"], "Size");
      }
      if (has("dye")) {
        if (v.dyeProcess === "") fail(["dyeProcess"], "DyeProcess");
        if (v.dyeProcess === "OTHER") {
          if (v.dyeProcessOther.trim() === "") fail(["dyeProcessOther"], "DyeProcessOther");
          else if (v.dyeProcessOther.trim().length > 80) fail(["dyeProcessOther"], "Size");
        }
        if (v.shade.trim().length > 100) fail(["shade"], "Size");
        if (v.chemicalStandards.length === 0) fail(["chemicalStandards"], "Chemicals");
        else if (v.chemicalStandards.includes("NONE") && v.chemicalStandards.length > 1) fail(["chemicalStandards"], "NoneExclusive");
      }

      const name = v.submitterName.trim();
      if (name === "") fail(["submitterName"], "NameRequired");
      else if (name.length < 3) fail(["submitterName"], "NameShort");
      else if (name.length > 100) fail(["submitterName"], "Size");
      if (v.submitterRole.trim().length > 100) fail(["submitterRole"], "Size");
    });
}

/** What goes to the API: only the fields of the step type's sections, only what was filled. */
export function toStepData(values: SubmissionValues, type: StepType): StepData {
  const sections = sectionsFor(type);
  const has = (section: SectionId) => sections.includes(section);
  const data: StepData = {};
  const decimal = (text: string) => {
    const n = parseDecimal(text);
    return n === undefined || Number.isNaN(n) ? undefined : n;
  };
  const text = (value: string) => (value.trim() === "" ? undefined : value.trim());

  if (has("fibers")) {
    data.fiberComposition = values.fibers.map((r) => ({ fiber: r.fiber, percent: Number(r.percent) }));
  }
  if (has("fibers") || has("origin")) data.originCountry = text(values.originCountry);
  if (has("energy")) {
    if (energyFilled(values.energy)) {
      data.energySources = values.energy.map((r) => ({ source: r.source, percent: Number(r.percent) }));
    }
    if (energyUnit(type) === "KWH_PER_KG") data.energyKwhPerKg = decimal(values.energyKwhPerKg);
    if (energyUnit(type) === "KWH_PER_PIECE") data.energyKwhPerPiece = decimal(values.energyKwhPerPiece);
  }
  if (has("delivery") || has("fabric") || has("quantity")) data.deliveredKg = decimal(values.deliveredKg);
  if (has("delivery")) {
    const count = text(values.yarnCount);
    data.yarnCount = count ? `Ne ${count}` : undefined;
    data.yarnProcess = values.yarnProcess === "" ? undefined : values.yarnProcess;
  }
  if (has("fabric")) {
    data.fabricType = text(values.fabricType);
    data.gsm = decimal(values.gsm);
  }
  if (has("dye")) {
    data.dyeProcess = values.dyeProcess === "" ? undefined : values.dyeProcess;
    if (values.dyeProcess === "OTHER") data.dyeProcessOther = text(values.dyeProcessOther);
    data.shade = text(values.shade);
    data.chemicalStandards = values.chemicalStandards;
  }
  if (has("quantity")) data.waterLPerKg = decimal(values.waterLPerKg);
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as StepData;
}

/** The API's field of a violation ("data.fiberComposition[0].percent") → the form's path, or undefined. */
export function formPathOf(apiField: string): string | undefined {
  const [, field, rest] = /^data\.([A-Za-z]+)(.*)$/.exec(apiField) ?? [];
  if (!field) {
    if (apiField === "submitterName" || apiField === "submitterRole") return apiField;
    return undefined;
  }
  const index = /^\[(\d+)]\.([A-Za-z]+)$/.exec(rest ?? "");
  if (field === "fiberComposition") return index ? `fibers.${index[1]}.${index[2] === "fiber" ? "fiber" : "percent"}` : "fibersGroup";
  if (field === "energySources") return index ? `energy.${index[1]}.${index[2] === "source" ? "source" : "percent"}` : "energyGroup";
  return field;
}

/** Fields of the form each error path belongs to, for the count in "N alanda hata var". */
export function errorGroup(path: string): string {
  return path.replace(/Group$/, "");
}
