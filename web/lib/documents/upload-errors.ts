import { DOCUMENT_EXTENSIONS, DOCUMENT_MAX_BYTES } from "@tekpas/shared";
import { ApiError } from "@/lib/api/request";

/** Why an upload did not become a document (design v0.5 58b): a rejection of the server, or no answer at all. */
export type UploadErrorKind =
  | "format"
  | "size"
  | "empty"
  | "encrypted"
  | "pages"
  | "dimensions"
  | "duplicate"
  | "limit"
  | "published"
  | "rate"
  | "storage"
  | "forbidden"
  | "network"
  | "unknown";

/** These can work a little later without the person changing anything: the row offers "Tekrar dene". */
export const RETRYABLE: readonly UploadErrorKind[] = ["rate", "network", "storage"];

/** Cheap checks before a transfer; the server stays the authority (it reads the bytes, not the name). */
export function precheck(file: Pick<File, "name" | "size">): UploadErrorKind | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) return "format";
  if (file.size > DOCUMENT_MAX_BYTES) return "size";
  if (file.size === 0) return "empty";
  return undefined;
}

export function uploadErrorKind(error: unknown): UploadErrorKind {
  if (!(error instanceof ApiError)) return "network";
  const code = error.problem?.errors?.find((e) => e.field === "file")?.code;
  const reason = error.problem?.reason;
  switch (error.status) {
    case 400:
      if (code === "FileEncrypted" || code === "FileCorrupt") return "encrypted";
      if (code === "FilePages") return "pages";
      if (code === "FileDimensions") return "dimensions";
      if (code === "FileEmpty") return "empty";
      return "unknown";
    case 403:
      return "forbidden";
    case 409:
      if (reason === "DUPLICATE_DOCUMENT") return "duplicate";
      if (reason === "DOCUMENT_LIMIT") return "limit";
      if (reason === "BATCH_PUBLISHED") return "published";
      return "unknown";
    case 413:
      return "size";
    case 415:
      return "format";
    case 429:
      return "rate";
    case 502:
    case 503:
      return "storage";
    default:
      return "unknown";
  }
}
