/**
 * Enum values of the API. They mirror the backend enums (com.tekpas.product.Fiber, ProductCategory,
 * com.tekpas.batch.BatchStatus); the generated client has the same lists as types, these are the runtime values
 * for selects and Zod. Translations: web/messages (enums.*).
 */

export const FIBERS = [
  "COTTON",
  "ORGANIC_COTTON",
  "RECYCLED_COTTON",
  "POLYESTER",
  "RECYCLED_POLYESTER",
  "ELASTANE",
  "VISCOSE",
  "LINEN",
  "WOOL",
  "SILK",
  "POLYAMIDE",
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
  "Pattern",
  "GtinFormat",
  "GtinCheckDigit",
  "FiberTotal",
  "FiberDuplicate",
  "DateRange",
  "Unique",
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
