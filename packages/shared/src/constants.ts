import provinces from "./tr-provinces.json";

/**
 * Enum values of the API. They mirror the backend enums (com.tekpas.product.Fiber, ProductCategory,
 * com.tekpas.batch.BatchStatus, com.tekpas.company.CompanyType, com.tekpas.supplychain.*); the generated client has the same lists as types, these are the runtime values
 * for selects and Zod. Translations: web/messages (enums.*).
 */

export const FIBERS = [
  "COTTON",
  "ORGANIC_COTTON",
  "ELASTANE",
  "POLYESTER",
  "RECYCLED_POLYESTER",
  "LINEN",
  "WOOL",
  "VISCOSE",
  "POLYAMIDE",
  "LYOCELL",
  "RECYCLED_COTTON",
  "SILK",
  "OTHER",
] as const;
export type Fiber = (typeof FIBERS)[number];

export const PRODUCT_CATEGORIES = [
  "T_SHIRT",
  "SHIRT",
  "TROUSERS",
  "DRESS",
  "KNITWEAR",
  "SWEATSHIRT",
  "OUTERWEAR",
  "BABY",
  "HOME_TEXTILE",
  "FABRIC",
  "OTHER",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const BATCH_STATUSES = ["DRAFT", "COLLECTING", "READY", "PUBLISHED"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/** Company types a manufacturer can add to its supplier network. */
export const SUPPLIER_TYPES = ["YARN", "FABRIC", "DYEHOUSE", "SEWING", "ACCESSORY"] as const;
export type SupplierType = (typeof SUPPLIER_TYPES)[number];

/**
 * Turkey's 81 provinces in Turkish alphabetical order: the cities a supplier can be in. Single source for the
 * web app and the backend (TurkishProvinces, kept equal by a test).
 */
export const TR_PROVINCES: readonly string[] = provinces;

/** Supplier phone, E.164 (e.g. +902240000000). */
export const PHONE_PATTERN = /^\+[1-9][0-9]{6,14}$/;

export const STEP_TYPES = ["FIBER", "YARN", "FABRIC", "DYEING", "SEWING", "ACCESSORY", "PACKAGING"] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const STEP_STATUSES = ["PENDING", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const ENERGY_SOURCES = ["GRID", "SOLAR", "WIND", "NATURAL_GAS", "COAL", "BIOMASS", "OTHER"] as const;
export type EnergySource = (typeof ENERGY_SOURCES)[number];

export const YARN_PROCESSES = ["COMBED", "CARDED", "OPEN_END", "OTHER"] as const;
export type YarnProcess = (typeof YARN_PROCESSES)[number];

/** Dyeing process (design v0.4 41); OTHER needs `dyeProcessOther`. */
export const DYE_PROCESSES = ["REACTIVE", "DISPERSE", "VAT", "PIGMENT", "OTHER"] as const;
export type DyeProcess = (typeof DYE_PROCESSES)[number];

/** Chemical compliance, all that apply (design v0.4 41); NONE ("Hiçbiri") cannot be combined with the others. */
export const CHEMICAL_STANDARDS = ["ZDHC_MRSL", "OEKO_TEX_ECO_PASSPORT", "BLUESIGN", "GOTS_APPROVED", "NONE"] as const;
export type ChemicalStandard = (typeof CHEMICAL_STANDARDS)[number];

/**
 * "Düzeltme iste" presets (design v0.4 47b) and the step data fields each marks on the supplier's form (45).
 * The single place for this mapping: the documents' presets ("Belge okunaksız", "Sertifika süresi dolmuş")
 * join with M5 and M7. `stepTypes` are the steps that have those fields (backend StepData).
 */
export const CORRECTION_PRESETS = [
  { key: "FIBER_MISMATCH", fields: ["fiberComposition"], stepTypes: ["YARN", "FABRIC"] },
] as const satisfies readonly { key: string; fields: readonly string[]; stepTypes: readonly StepType[] }[];
export type CorrectionPreset = (typeof CORRECTION_PRESETS)[number]["key"];

/** GS1 AI(10): up to 20 characters of A–Z, 0–9 and "-". */
export const BATCH_NO_PATTERN = /^[A-Z0-9-]{1,20}$/;

/**
 * Field error codes, the same strings the backend returns in ApiProblem.errors[].code. Zod issues of the
 * schemas here carry them as their message, so a form translates backend and client errors the same way
 * (web/messages: errors.field.<code>).
 */
export const FIELD_ERROR_CODES = [
  "NotNull",
  "NotBlank",
  "Size",
  "Min",
  "Max",
  "Positive",
  "Digits",
  "Integer",
  "Pattern",
  "GtinFormat",
  "GtinCheckDigit",
  "FiberTotal",
  "FiberDuplicate",
  "DateRange",
  "Unique",
  "SupplierType",
  "City",
  "NotApplicable",
  "SameBatch",
  "Cycle",
  "EnergyTotal",
  "EnergyDuplicate",
  "NoneExclusive",
  "Duplicate",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
