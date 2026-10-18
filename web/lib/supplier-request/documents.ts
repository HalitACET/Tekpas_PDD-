import type { PublicDocument } from "@/lib/api/public-request";
import { precheck, type UploadErrorKind } from "@/lib/documents/upload-errors";

/** A link takes at most this many documents (backend PublicDocumentService.MAX_PER_LINK). */
export const MAX_LINK_DOCUMENTS = 5;

/**
 * One line of the Documents section (design v0.5 49–55): a file waiting, on its way, uploaded, or turned away.
 * The supplier only ever sees these states; whatever happens to the document afterwards is not hers to see.
 */
export interface DocRow {
  /** The row's own id; the document's id once the server accepted it. */
  id: string;
  name: string;
  sizeBytes: number;
  state: "queued" | "uploading" | "done" | "failed";
  percent: number;
  error?: UploadErrorKind;
  /** The file, kept for "Tekrar dene". Rows that came with the page (an earlier visit) have none. */
  file?: File;
  /** The server's id of an uploaded document. */
  documentId?: string;
  /** "Kaldır" is on its way / failed. */
  removing?: boolean;
  removeFailed?: boolean;
}

export const rowOfDocument = (doc: PublicDocument): DocRow => ({
  id: doc.id,
  name: doc.fileName,
  sizeBytes: doc.sizeBytes,
  state: "done",
  percent: 100,
  documentId: doc.id,
});

/** What counts against the limit: everything the server holds or will hold. */
export const countedRows = (rows: readonly DocRow[]) => rows.filter((r) => r.state !== "failed");

export const isFull = (rows: readonly DocRow[]) => countedRows(rows).length >= MAX_LINK_DOCUMENTS;

/**
 * Cheap checks before a transfer (format, size, an empty file, the same file twice, the limit). The server stays
 * the authority: it reads the bytes, not the name, and a file it refuses comes back as a row with its reason.
 */
export function precheckDocument(file: Pick<File, "name" | "size">, rows: readonly DocRow[]): UploadErrorKind | undefined {
  const basic = precheck(file);
  if (basic) return basic;
  const counted = countedRows(rows);
  if (counted.some((r) => r.name === file.name && r.sizeBytes === file.size)) return "duplicate";
  if (counted.length >= MAX_LINK_DOCUMENTS) return "limit";
  return undefined;
}

/** These work a little later without the person changing anything: the row offers "Tekrar dene". */
export const canRetry = (row: DocRow) => row.state === "failed" && !!row.file && (row.error === "rate" || row.error === "network" || row.error === "storage" || row.error === "unknown");

export const extOf = (name: string) => (name.split(".").pop() ?? "").toUpperCase().replace("JPEG", "JPG");
