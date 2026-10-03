import { z } from "zod";

/**
 * Batch form rules, the same as the backend's BatchCreateRequest. Issue messages are field error codes
 * (FIELD_ERROR_CODES).
 */

/** Empty means "assign the next KP-YYYY-MMDD-<letter> number" (see GET /batches/next-batch-no). */
const batchNoOrEmpty = z
  .string()
  .regex(/^[A-Z0-9-]{0,20}$/, { error: "Pattern" })
  .nullish()
  .transform((v) => (v ? v : null));

const isoDate = z.iso.date({ error: "Pattern" }).nullish().transform((v) => v ?? null);

export const batchCreateSchema = z
  .object({
    productId: z.uuid({ error: "NotNull" }),
    batchNo: batchNoOrEmpty,
    productionOrderNo: z
      .string()
      .max(50, { error: "Size" })
      .nullish()
      .transform((v) => (v == null || v.trim() === "" ? null : v.trim())),
    quantity: z.number({ error: "NotNull" }).int({ error: "Positive" }).positive({ error: "Positive" }),
    producedFrom: isoDate,
    producedTo: isoDate,
  })
  .superRefine((batch, ctx) => {
    // ISO dates (YYYY-MM-DD) compare correctly as strings.
    if (batch.producedFrom && batch.producedTo && batch.producedTo < batch.producedFrom) {
      ctx.addIssue({ code: "custom", message: "DateRange", path: ["producedTo"], input: batch.producedTo });
    }
  });

export type BatchCreateInput = z.input<typeof batchCreateSchema>;
export type BatchCreateValues = z.output<typeof batchCreateSchema>;
