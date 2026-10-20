import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";

const SECRET = "s".repeat(40);

function call(body: unknown, authorization?: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/passport-cache", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/passport-cache", () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = SECRET;
    revalidateTag.mockReset();
  });
  afterEach(() => {
    delete process.env.REVALIDATE_SECRET;
  });

  it("drops the page of the code at once with the right secret", async () => {
    const response = await call({ gtin: "02012345000025", batchNo: "KP-2026-0915-A" }, `Bearer ${SECRET}`);

    expect(response.status).toBe(204);
    expect(revalidateTag).toHaveBeenCalledWith("passport:02012345000025:KP-2026-0915-A", { expire: 0 });
  });

  it("uses the canonical code: GTIN-13 and lower case reach the same cache entry", async () => {
    const response = await call({ gtin: "2012345000025".padStart(13, "0"), batchNo: "kp-2026-0915-a" }, `Bearer ${SECRET}`);

    // A 13-digit form of a valid GTIN-14 only exists when its first digit is 0.
    expect(response.status).toBe(204);
    expect(revalidateTag).toHaveBeenCalledWith("passport:02012345000025:KP-2026-0915-A", { expire: 0 });
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", `Bearer ${"x".repeat(40)}`],
    ["a secret of another length", "Bearer short"],
    ["another scheme", `Basic ${SECRET}`],
    ["the secret without a scheme", SECRET],
  ])("answers 401 and does nothing with %s", async (_name, authorization) => {
    const response = await call({ gtin: "02012345000025", batchNo: "A" }, authorization);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{"],
    ["no code", {}],
    ["a wrong check digit", { gtin: "02012345000026", batchNo: "A" }],
    ["a batch number that is not AI (10)", { gtin: "02012345000025", batchNo: "A B" }],
    ["numbers instead of text", { gtin: 2012345000025, batchNo: 1 }],
  ])("answers 400 for %s", async (_name, body) => {
    const response = await call(body, `Bearer ${SECRET}`);

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("stays closed (503) without a secret or with a short one", async () => {
    delete process.env.REVALIDATE_SECRET;
    expect((await call({ gtin: "02012345000025", batchNo: "A" }, "Bearer ")).status).toBe(503);

    process.env.REVALIDATE_SECRET = "too-short";
    expect((await call({ gtin: "02012345000025", batchNo: "A" }, "Bearer too-short")).status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
