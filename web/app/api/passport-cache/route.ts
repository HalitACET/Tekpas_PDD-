import { parseDigitalLink } from "@tekpas/shared";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { passportTag } from "@/lib/passport/cache";

/** Shorter than this is a mistake, not a secret: the route stays closed (503) until it is set properly. */
const MIN_SECRET_LENGTH = 32;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant time, whatever the lengths. */
function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

/**
 * The backend tells the web app that a passport page is stale (after a publishing or a withdrawal, docs/m6-plan.md
 * §5.3). Bearer secret (REVALIDATE_SECRET, the same on Render and Vercel); the body names the code. The cached data of
 * that page is dropped at once (`expire: 0`: the next scan waits for fresh data instead of being served the old
 * version). Nothing here is public: without the secret the answer is 401 and nothing else is said.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    return Response.json({ error: "not-configured" }, { status: 503 });
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!sameSecret(given, secret)) {
    return new Response(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400 });
  }
  const { gtin, batchNo } = (body ?? {}) as { gtin?: unknown; batchNo?: unknown };
  const key = typeof gtin === "string" && typeof batchNo === "string" ? parseDigitalLink(gtin, batchNo) : undefined;
  if (!key) {
    return Response.json({ error: "invalid-code" }, { status: 400 });
  }

  revalidateTag(passportTag(key.gtin, key.batchNo), { expire: 0 });
  return new Response(null, { status: 204 });
}
