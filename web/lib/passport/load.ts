import { unstable_cache } from "next/cache";
import { backendUrl } from "@/lib/env";
import { passportTag } from "./cache";
import type { PublicPassport } from "./types";

/** What the public endpoint says about a code that is worth keeping: a published passport or a withdrawn one. */
export type LoadedPassport =
  | { kind: "published"; passport: PublicPassport }
  | { kind: "withdrawn"; withdrawnAt: string };

/** No published passport for the code (404). Not cached: a code that is not there yet may be tomorrow. */
export class PassportNotFound extends Error {}

/** The backend did not answer in time or failed: the page says it is preparing and tries again. Not cached. */
export class PassportUnavailable extends Error {}

/** How long a cold backend (a sleeping free-tier server) may keep a scan waiting before the page says "preparing". */
export const BACKEND_WAIT_MS = 8000;

async function fetchPassport(gtin: string, batchNo: string): Promise<LoadedPassport> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/v1/public/passports/01/${gtin}/10/${batchNo}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(BACKEND_WAIT_MS),
    });
  } catch {
    throw new PassportUnavailable("The backend did not answer");
  }
  if (response.status === 200) return { kind: "published", passport: (await response.json()) as PublicPassport };
  if (response.status === 410) {
    const body = (await response.json()) as { withdrawnAt?: string };
    return { kind: "withdrawn", withdrawnAt: body.withdrawnAt ?? "" };
  }
  if (response.status === 404) throw new PassportNotFound();
  throw new PassportUnavailable(`The backend answered HTTP ${response.status}`);
}

/**
 * The passport of a canonical code, cached under its tag until a publishing or a withdrawal drops it
 * (docs/m6-plan.md §5.3, POST /api/passport-cache). The cached value is language independent, so one entry serves
 * every language. A failure throws and is not cached; a published or withdrawn answer is kept (the cache survives
 * requests and deploys), so a scan does not wake the backend.
 */
export function loadPassport(gtin: string, batchNo: string): Promise<LoadedPassport> {
  return unstable_cache(() => fetchPassport(gtin, batchNo), ["passport", "v1", gtin, batchNo], {
    tags: [passportTag(gtin, batchNo)],
    // Safety net: without REVALIDATE_SECRET (or when the refresh job fails) a republished page would stay old for ever.
    // Stale data is served while it is fetched again, so a scan never waits for a sleeping backend.
    revalidate: 600,
  })();
}
