import type { useCapture } from "./capture";
import { uploadQueue } from "./upload-queue";

/**
 * The photographed document goes to the upload queue (design v0.9 107a–107c): its pages are copied into the queue's
 * folder, then the capture starts afresh. Answers the queue item's id.
 */
export async function queueCapture(capture: ReturnType<typeof useCapture>): Promise<string> {
  if (!capture.batch || !capture.step) throw new Error("Nothing to queue");
  const item = await uploadQueue.add({
    stepId: capture.step.id,
    batchNo: capture.batch.batchNo,
    stepType: capture.step.stepType,
    supplierName: capture.step.supplierName,
    docType: capture.docType,
    pages: capture.pages,
  });
  capture.reset();
  return item.id;
}
