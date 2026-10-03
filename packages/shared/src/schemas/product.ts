import { z } from "zod";
import { FIBERS, PRODUCT_CATEGORIES } from "../constants";
import { gtinCheckDigit, hasAcceptedGtinFormat } from "../gtin";

/**
 * Product form rules, the same as the backend's ProductCreateRequest. Issue messages are field error codes
 * (FIELD_ERROR_CODES); FiberTotal carries params.total and FiberDuplicate params.fiber, like the API.
 */

/** GTIN-8/12/13/14 with a valid GS1 check digit; the parsed value is the 14-digit form. */
export const gtinSchema = z
  .string({ error: "NotNull" })
  .refine(hasAcceptedGtinFormat, { error: "GtinFormat" })
  // Only judged when the format is right, so a malformed value reports GtinFormat alone.
  .refine((v) => !hasAcceptedGtinFormat(v) || gtinCheckDigit(v.slice(0, -1)) === Number(v.at(-1)), {
    error: "GtinCheckDigit",
  })
  .transform((v) => v.padStart(14, "0"));

export const fiberShareSchema = z.object({
  fiber: z.enum(FIBERS, { error: "NotNull" }),
  percent: z
    .number({ error: "NotNull" })
    .int({ error: "Min" })
    .min(1, { error: "Min" })
    .max(100, { error: "Max" }),
});

/** Whole percentages that add up to exactly 100, each fiber at most once. */
export const fiberCompositionSchema = z.array(fiberShareSchema).superRefine((shares, ctx) => {
  const seen = new Set<string>();
  const duplicate = shares.find((s) => (seen.has(s.fiber) ? true : (seen.add(s.fiber), false)));
  if (duplicate) {
    ctx.addIssue({ code: "custom", message: "FiberDuplicate", params: { fiber: duplicate.fiber }, input: shares });
  }
  const total = shares.reduce((sum, s) => sum + s.percent, 0);
  if (total !== 100) {
    ctx.addIssue({ code: "custom", message: "FiberTotal", params: { total }, input: shares });
  }
});

/** Sum of the percentages entered so far, e.g. for a live "Total: 95 %" hint next to the fiber rows. */
export function fiberTotal(shares: ReadonlyArray<{ percent?: number | null }>): number {
  return shares.reduce((sum, s) => sum + (Number.isFinite(s.percent) ? Number(s.percent) : 0), 0);
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max, { error: "Size" })
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

export const productCreateSchema = z.object({
  gtin: gtinSchema,
  sku: optionalText(60),
  name: z.string({ error: "NotBlank" }).trim().min(1, { error: "NotBlank" }).max(200, { error: "Size" }),
  category: z.enum(PRODUCT_CATEGORIES, { error: "NotNull" }),
  description: optionalText(2000),
  declaredFiberComposition: fiberCompositionSchema.nullish().transform((v) => v ?? null),
});

export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductCreateValues = z.output<typeof productCreateSchema>;
