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
  "NotApplicable",
  "SameBatch",
  "Cycle",
  "EnergyTotal",
  "EnergyDuplicate",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
