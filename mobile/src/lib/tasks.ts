import type { components } from "@tekpas/api-client";

export type TaskItem = components["schemas"]["TaskItem"];
export type AwaitingDocument = components["schemas"]["AwaitingDocument"];
export type ExpiringCertificate = components["schemas"]["ExpiringCertificate"];

/** One row per certificate, the batches it is used in together (the web's tasks page does the same). */
export interface CertificateTask {
  key: string;
  docType: ExpiringCertificate["docType"];
  daysLeft: number;
  supplierName?: string | null;
  stepId: string;
  batchId: string;
}

export function certificateTasks(items: ExpiringCertificate[] | undefined): CertificateTask[] {
  const byKey = new Map<string, CertificateTask>();
  for (const c of items ?? []) {
    const key = `${c.supplierId ?? c.holderName ?? c.stepId}|${c.docType}|${c.validUntil}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        docType: c.docType,
        daysLeft: c.daysLeft,
        supplierName: c.supplierName ?? c.holderName,
        stepId: c.stepId,
        batchId: c.batchId,
      });
    }
  }
  return [...byKey.values()];
}

/** What the reading of a waiting document says, for its chip (design v0.8 92a). */
export function readingChip(doc: Pick<AwaitingDocument, "extractionStatus" | "extractionMethod" | "proposedFields" | "lowConfidence">):
  | { kind: "lowConfidence" | "approved" | "rejected"; key: string; count?: number } {
  if (doc.extractionStatus === "UNREADABLE" || doc.extractionStatus === "FAILED" || doc.proposedFields === 0) {
    return { kind: "rejected", key: "tasks.unreadable" };
  }
  const ai = doc.extractionMethod === "LLM";
  if (doc.lowConfidence > 0) return { kind: "lowConfidence", key: ai ? "tasks.aiReadLow" : "tasks.ruleReadLow", count: doc.lowConfidence };
  return { kind: "approved", key: ai ? "tasks.aiRead" : "tasks.ruleRead" };
}
