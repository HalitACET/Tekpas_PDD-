import type { FieldViolation } from "@tekpas/api-client";
import {
  type Fiber,
  fiberCompositionSchema,
  hasAcceptedGtinFormat,
  hasValidGtinCheckDigit,
  normalizeGtin,
  type ProductCategory,
  productCreateSchema,
} from "@tekpas/shared";
import { z } from "zod";
import type { ProductResponse, ProductUpdateRequest } from "@/lib/api/products";
import { displayGtin } from "@/lib/format";

/** What the sheet edits. Percentages are text, as typed ("90", "90,5"); the schema turns them into numbers. */
export interface ProductFormValues {
  name: string;
  gtin: string;
  sku: string;
  category: ProductCategory;
  description: string;
  declaredFiberComposition: { fiber: Fiber; percent: string }[];
}

/** "90" → 90, "90,5" → 90.5 (then an Integer error), "" → undefined (NotNull), "abc" → NaN (Integer). */
export function parsePercent(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return /^-?\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
}

/**
 * The shared product rules (@tekpas/shared, same codes as the API), with the typed percentages converted
 * first. The design requires a composition, so it is not optional here.
 */
export const productFormSchema = productCreateSchema.extend({
  declaredFiberComposition: z.preprocess(
    (rows) =>
      Array.isArray(rows)
        ? rows.map((row: { fiber: Fiber; percent: string }) => ({ ...row, percent: parsePercent(row.percent) }))
        : rows,
    fiberCompositionSchema,
  ),
});

export type ProductFormOutput = z.output<typeof productFormSchema>;

/** Design 04: a new product starts as "Tişört" with one empty cotton line. */
export function emptyProductForm(): ProductFormValues {
  return {
    name: "",
    gtin: "",
    sku: "",
    category: "T_SHIRT",
    description: "",
    declaredFiberComposition: [{ fiber: "COTTON", percent: "" }],
  };
}

export function productFormFrom(product: ProductResponse): ProductFormValues {
  return {
    name: product.name,
    gtin: displayGtin(product.gtin),
    sku: product.sku ?? "",
    category: product.category,
    description: product.description ?? "",
    declaredFiberComposition: product.declaredFiberComposition?.length
      ? product.declaredFiberComposition.map((s) => ({ fiber: s.fiber, percent: String(s.percent) }))
      : [{ fiber: "COTTON", percent: "" }],
  };
}

/** Live hint under the GTIN input (design 03/04), before the duplicate check. */
export type GtinHint =
  | { kind: "idle" }
  | { kind: "digitsOnly" }
  | { kind: "length"; count: number }
  | { kind: "checkDigit" }
  | { kind: "valid"; length: number; gtin14: string };

export function gtinHint(raw: string): GtinHint {
  const value = raw.trim();
  if (value === "") return { kind: "idle" };
  if (!/^\d+$/.test(value)) return { kind: "digitsOnly" };
  if (!hasAcceptedGtinFormat(value)) return { kind: "length", count: value.length };
  if (!hasValidGtinCheckDigit(value)) return { kind: "checkDigit" };
  return { kind: "valid", length: value.length, gtin14: normalizeGtin(value) };
}

/** Sum of the lines that hold a number (live badge "Toplam %95"). */
export function fiberFormTotal(rows: ProductFormValues["declaredFiberComposition"]): number {
  return rows.reduce((sum, row) => {
    const n = parsePercent(row.percent);
    return sum + (n !== undefined && Number.isFinite(n) ? n : 0);
  }, 0);
}

/** The footer hint of the design, in its order: GTIN, then fiber total, then name. */
export type SaveBlocker = "gtin" | "total" | "name" | undefined;

export function saveBlocker(values: ProductFormValues, gtinOk: boolean): SaveBlocker {
  if (!gtinOk) return "gtin";
  if (fiberFormTotal(values.declaredFiberComposition) !== 100) return "total";
  if (values.name.trim() === "") return "name";
  return undefined;
}

/**
 * API field path → form path: "declaredFiberComposition[0].percent" → "declaredFiberComposition.0.percent".
 * The form uses the API's field names, so nothing else changes.
 */
export function formPath(apiField: string): string {
  return apiField.replace(/\[(\d+)]/g, ".$1");
}

export interface FormFieldError {
  path: string;
  code: string;
  params?: Record<string, unknown>;
}

export function fieldErrorsFrom(errors: FieldViolation[] | null | undefined): FormFieldError[] {
  return (errors ?? []).map((e) => ({ path: formPath(e.field), code: e.code, params: e.params ?? undefined }));
}

/** PATCH with only what changed; cleared optional texts are sent as null. */
export function productPatch(
  initial: ProductFormValues,
  values: ProductFormOutput,
  { gtinLocked }: { gtinLocked: boolean },
): ProductUpdateRequest {
  const patch: ProductUpdateRequest = {};
  if (values.name !== initial.name.trim()) patch.name = values.name;
  const initialGtin = hasAcceptedGtinFormat(initial.gtin) ? normalizeGtin(initial.gtin) : initial.gtin;
  if (!gtinLocked && values.gtin !== initialGtin) patch.gtin = values.gtin;
  if ((values.sku ?? "") !== initial.sku.trim()) patch.sku = values.sku;
  if (values.category !== initial.category) patch.category = values.category;
  if ((values.description ?? "") !== initial.description.trim()) patch.description = values.description;
  const before = JSON.stringify(
    initial.declaredFiberComposition.map((s) => ({ fiber: s.fiber, percent: parsePercent(s.percent) })),
  );
  if (JSON.stringify(values.declaredFiberComposition) !== before) {
    patch.declaredFiberComposition = values.declaredFiberComposition;
  }
  return patch;
}
