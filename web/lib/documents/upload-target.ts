import { z } from "zod";

/**
 * "Belge yükle" on the documents page: the batch and the supply chain step a document goes to. Only the choice
 * of the panel, so no shared schema: the step's own upload endpoint checks the rest (published batch, limits).
 */
export const uploadTargetSchema = z.object({
  batchId: z.string().min(1, "NotBlank"),
  stepId: z.string().min(1, "NotBlank"),
});

export type UploadTarget = z.infer<typeof uploadTargetSchema>;

export const emptyUploadTarget = (): UploadTarget => ({ batchId: "", stepId: "" });
