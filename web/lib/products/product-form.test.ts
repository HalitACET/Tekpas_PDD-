import { describe, expect, it } from "vitest";
import {
  emptyProductForm,
  fiberFormTotal,
  fieldErrorsFrom,
  gtinHint,
  parsePercent,
  productFormSchema,
  type ProductFormValues,
  productPatch,
  saveBlocker,
} from "./product-form";

const valid: ProductFormValues = {
  name: "Organik pamuk tişört, ekru",
  gtin: "2012345000018",
  sku: "KT-TS-0142",
  category: "T_SHIRT",
  description: "",
  declaredFiberComposition: [
    { fiber: "ORGANIC_COTTON", percent: "95" },
    { fiber: "ELASTANE", percent: "5" },
  ],
};

function codes(values: ProductFormValues) {
  const result = productFormSchema.safeParse(values);
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}:${i.message}`);
}

describe("parsePercent", () => {
  it("reads whole numbers and keeps fractions so they can be rejected, never rounded", () => {
    expect(parsePercent("90")).toBe(90);
    expect(parsePercent(" 5 ")).toBe(5);
    expect(parsePercent("90,5")).toBe(90.5);
    expect(parsePercent("")).toBeUndefined();
    expect(parsePercent("abc")).toBeNaN();
  });
});

describe("productFormSchema", () => {
  it("accepts the design's product and normalizes the GTIN", () => {
    const parsed = productFormSchema.parse(valid);

    expect(parsed.gtin).toBe("02012345000018");
    expect(parsed.declaredFiberComposition).toEqual([
      { fiber: "ORGANIC_COTTON", percent: 95 },
      { fiber: "ELASTANE", percent: 5 },
    ]);
    expect(parsed.description).toBeNull();
  });

  it("reports a decimal percentage as Integer instead of rounding it", () => {
    const values = {
      ...valid,
      declaredFiberComposition: [
        { fiber: "ORGANIC_COTTON" as const, percent: "94,5" },
        { fiber: "ELASTANE" as const, percent: "5,5" },
      ],
    };

    expect(codes(values)).toEqual(
      expect.arrayContaining(["declaredFiberComposition.0.percent:Integer", "declaredFiberComposition.1.percent:Integer"]),
    );
  });

  it("reports the API's codes for check digit and fiber total", () => {
    const values = {
      ...valid,
      gtin: "2012345000019",
      declaredFiberComposition: [{ fiber: "ORGANIC_COTTON" as const, percent: "95" }],
    };

    expect(codes(values).sort()).toEqual(["declaredFiberComposition:FiberTotal", "gtin:GtinCheckDigit"]);
  });
});

describe("gtinHint", () => {
  it("walks through the design's states", () => {
    expect(gtinHint("")).toEqual({ kind: "idle" });
    expect(gtinHint("8690 12")).toEqual({ kind: "digitsOnly" });
    expect(gtinHint("123456789")).toEqual({ kind: "length", count: 9 });
    expect(gtinHint("2012345000019")).toEqual({ kind: "checkDigit" });
    expect(gtinHint("2012345000018")).toEqual({ kind: "valid", length: 13, gtin14: "02012345000018" });
    expect(gtinHint("96385074")).toEqual({ kind: "valid", length: 8, gtin14: "00000096385074" });
  });
});

describe("saveBlocker", () => {
  it("follows the design's order: GTIN, fiber total, name", () => {
    expect(saveBlocker(valid, false)).toBe("gtin");
    expect(saveBlocker({ ...valid, declaredFiberComposition: [{ fiber: "COTTON", percent: "95" }] }, true)).toBe(
      "total",
    );
    expect(saveBlocker({ ...valid, name: " " }, true)).toBe("name");
    expect(saveBlocker(valid, true)).toBeUndefined();
    expect(fiberFormTotal(emptyProductForm().declaredFiberComposition)).toBe(0);
  });
});

describe("fieldErrorsFrom", () => {
  it("maps API field paths to form paths and keeps params", () => {
    expect(
      fieldErrorsFrom([
        { field: "declaredFiberComposition[1].percent", code: "Min", message: null },
        { field: "declaredFiberComposition", code: "FiberTotal", message: null, params: { total: 99 } },
      ]),
    ).toEqual([
      { path: "declaredFiberComposition.1.percent", code: "Min", params: undefined },
      { path: "declaredFiberComposition", code: "FiberTotal", params: { total: 99 } },
    ]);
  });
});

describe("productPatch", () => {
  const initial = valid;

  it("sends only what changed, and null for cleared texts", () => {
    const values = productFormSchema.parse({ ...valid, name: "Yeni ad", sku: "" });

    expect(productPatch(initial, values, { gtinLocked: false })).toEqual({ name: "Yeni ad", sku: null });
  });

  it("never sends a locked GTIN", () => {
    const values = productFormSchema.parse({ ...valid, gtin: "96385074" });

    expect(productPatch(initial, values, { gtinLocked: true })).toEqual({});
    expect(productPatch(initial, values, { gtinLocked: false })).toEqual({ gtin: "00000096385074" });
  });

  it("sends the whole composition when a line changes", () => {
    const values = productFormSchema.parse({
      ...valid,
      declaredFiberComposition: [
        { fiber: "ORGANIC_COTTON", percent: "90" },
        { fiber: "ELASTANE", percent: "10" },
      ],
    });

    expect(productPatch(initial, values, { gtinLocked: false }).declaredFiberComposition).toEqual([
      { fiber: "ORGANIC_COTTON", percent: 90 },
      { fiber: "ELASTANE", percent: 10 },
    ]);
  });
});
