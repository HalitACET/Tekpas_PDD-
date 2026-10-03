import { describe, expect, it } from "vitest";
import { fiberCompositionSchema, fiberTotal, productCreateSchema } from "./product";

const valid = {
  gtin: "02012345000018",
  sku: " NG-TS-001 ",
  name: "Mavi Basic Tişört",
  category: "T_SHIRT",
  declaredFiberComposition: [
    { fiber: "COTTON", percent: 95 },
    { fiber: "ELASTANE", percent: 5 },
  ],
} as const;

function issues(input: unknown) {
  const result = productCreateSchema.safeParse(input);
  return (result.error?.issues ?? []).map((i) => ({
    path: i.path.join("."),
    code: i.message,
    params: "params" in i ? i.params : undefined,
  }));
}

describe("productCreateSchema", () => {
  it("accepts a valid product and normalizes it like the API", () => {
    const parsed = productCreateSchema.parse({ ...valid, gtin: "2012345000018", description: "" });

    expect(parsed.gtin).toBe("02012345000018");
    expect(parsed.sku).toBe("NG-TS-001");
    expect(parsed.description).toBeNull();
    expect(parsed.declaredFiberComposition).toHaveLength(2);
    expect(productCreateSchema.parse({ ...valid, declaredFiberComposition: undefined }).declaredFiberComposition)
      .toBeNull();
  });

  it.each([94, 96])("rejects a fiber total of %i + 5 and reports the total", (cotton) => {
    const input = {
      ...valid,
      declaredFiberComposition: [
        { fiber: "COTTON", percent: cotton },
        { fiber: "ELASTANE", percent: 5 },
      ],
    };

    expect(issues(input)).toEqual([
      { path: "declaredFiberComposition", code: "FiberTotal", params: { total: cotton + 5 } },
    ]);
  });

  it("rejects the same fiber twice", () => {
    const input = {
      ...valid,
      declaredFiberComposition: [
        { fiber: "COTTON", percent: 50 },
        { fiber: "COTTON", percent: 50 },
      ],
    };

    expect(issues(input)).toEqual([
      { path: "declaredFiberComposition", code: "FiberDuplicate", params: { fiber: "COTTON" } },
    ]);
  });

  it("validates each fiber line", () => {
    const input = { ...valid, declaredFiberComposition: [{ fiber: "NYLON", percent: 100.5 }] };

    expect(issues(input).map((i) => `${i.path}:${i.code}`)).toEqual(
      expect.arrayContaining(["declaredFiberComposition.0.fiber:NotNull", "declaredFiberComposition.0.percent:Min"]),
    );
  });

  it("reports the same codes as the API for required fields and lengths", () => {
    const input = { ...valid, gtin: "2012345000019", name: "  ", category: "SOCKS", sku: "x".repeat(61) };

    expect(issues(input).map((i) => `${i.path}:${i.code}`).sort()).toEqual([
      "category:NotNull",
      "gtin:GtinCheckDigit",
      "name:NotBlank",
      "sku:Size",
    ]);
  });
});

describe("fiber helpers", () => {
  it("sums what has been entered so far", () => {
    expect(fiberTotal([{ percent: 60 }, { percent: 35 }, { percent: null }, {}])).toBe(95);
  });

  it("accepts 100 % of a single fiber, including the new codes", () => {
    expect(fiberCompositionSchema.safeParse([{ fiber: "POLYAMIDE", percent: 100 }]).success).toBe(true);
  });
});
