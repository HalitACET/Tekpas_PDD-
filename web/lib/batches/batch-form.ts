import { batchCreateSchema } from "@tekpas/shared";
import { z } from "zod";
import type { BatchCreateRequest } from "@/lib/api/batches";

/** What the "Yeni parti" dialog edits; the quantity is text as typed ("1.800"). */
export interface BatchFormValues {
  productId: string;
  batchNo: string;
  productionOrderNo: string;
  quantity: string;
  producedFrom: string;
  producedTo: string;
}

export function emptyBatchForm(batchNo = ""): BatchFormValues {
  return { productId: "", batchNo, productionOrderNo: "", quantity: "", producedFrom: "", producedTo: "" };
}

/**
 * "1800" and "1.800" / "1,800" / "1 800" (thousands grouping) → 1800; anything with a fraction ("2,5") →
 * NaN, which the shared schema reports as Integer; "" → undefined (NotNull).
 */
export function parseQuantity(text: string): number | undefined {
  const value = text.trim().replace(/ /g, " ");
  if (value === "") return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  if (/^\d{1,3}([.,\s]\d{3})+$/.test(value) && new Set(value.match(/[.,\s]/g)).size === 1) {
    return Number(value.replace(/[.,\s]/g, ""));
  }
  return Number.NaN;
}

/**
 * GS1 AI(10) allows A–Z only: upper-case with English rules, so a Turkish "i" becomes "I", not "İ"
 * (which the API would reject).
 */
export function batchNoInput(text: string): string {
  return text.toLocaleUpperCase("en").replace(/\s/g, "");
}

/** The shared batch rules (@tekpas/shared, same codes as the API) with the typed quantity converted first. */
export const batchFormSchema = z.preprocess(
  (values) =>
    typeof values === "object" && values !== null
      ? {
          ...values,
          quantity: parseQuantity(String((values as BatchFormValues).quantity ?? "")),
          productId: (values as BatchFormValues).productId || undefined,
        }
      : values,
  batchCreateSchema,
);

export type BatchFormOutput = z.output<typeof batchCreateSchema>;

export function batchCreateBody(output: BatchFormOutput): BatchCreateRequest {
  return {
    productId: output.productId,
    batchNo: output.batchNo,
    productionOrderNo: output.productionOrderNo,
    quantity: output.quantity,
    producedFrom: output.producedFrom,
    producedTo: output.producedTo,
  };
}
