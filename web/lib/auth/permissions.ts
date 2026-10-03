import type { SessionUser } from "./session";

type Role = SessionUser["role"];

/**
 * Simple rule until the full role matrix (PLAN.md §2, M12), mirroring the backend: OWNER, ADMIN and EDITOR
 * change products and batches, VIEWER only reads. The backend's 403 is the real protection; this only
 * shapes the UI.
 */
export function canWriteCatalog(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "EDITOR";
}

/** Pages a supplier user cannot use (the API answers 403); they are sent to their tasks instead. */
const SUPPLIER_BLOCKED = ["/products", "/batches"];

export function supplierRedirect(role: Role, pathname: string): string | undefined {
  if (role !== "SUPPLIER") return undefined;
  return SUPPLIER_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? "/tasks" : undefined;
}
