import { useSyncExternalStore } from "react";
import { type QueueSnapshot, uploadQueue } from "./upload-queue";

/** The upload queue, re-rendering on every change (an upload's progress included). */
export function useUploadQueue(): QueueSnapshot {
  return useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot, uploadQueue.getSnapshot);
}

/** What still has to go up: waiting, uploading or refused. */
export function pendingCount(snapshot: QueueSnapshot): number {
  return snapshot.items.filter((i) => i.status !== "uploaded").length;
}
