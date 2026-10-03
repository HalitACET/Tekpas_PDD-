import { describe, expect, it } from "vitest";
import { batchCreateBody, batchFormSchema, batchNoInput, emptyBatchForm, parseQuantity } from "./batch-form";

const valid = {
  ...emptyBatchForm("KP-2026-1003-A"),
  productId: "20000000-0000-4000-8000-000000000001",
  productionOrderNo: "ÜE-2026-0452",
  quantity: "1.800",
  producedFrom: "2026-09-29",
  producedTo: "2026-10-17",
};

function codes(values: unknown) {
  const result = batchFormSchema.safeParse(values);
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}:${i.message}`).sort();
}

describe("parseQuantity", () => {
  it("reads whole numbers with or without thousands grouping", () => {
    expect(parseQuantity("1800")).toBe(1800);
    expect(parseQuantity("1.800")).toBe(1800);
    expect(parseQuantity("1,800")).toBe(1800);
    expect(parseQuantity("12 000")).toBe(12000);
    expect(parseQuantity("1.234.567")).toBe(1234567);
    expect(parseQuantity(" ")).toBeUndefined();
  });

  it("keeps fractions and odd input as NaN so they are rejected, never rounded", () => {
    expect(parseQuantity("2,5")).toBeNaN();
    expect(parseQuantity("2.50")).toBeNaN();
    expect(parseQuantity("1.234,5")).toBeNaN();
    expect(parseQuantity("1.234,567")).toBeNaN();
    expect(parseQuantity("abc")).toBeNaN();
  });
});

describe("batchNoInput", () => {
  it("upper-cases with English rules, so a Turkish i stays a GS1 character", () => {
    expect(batchNoInput("kp-2026-1003-i")).toBe("KP-2026-1003-I");
    expect(batchNoInput("kp 2026")).toBe("KP2026");
  });
});

describe("batchFormSchema", () => {
  it("accepts the design's batch and builds the API body", () => {
    const parsed = batchFormSchema.parse(valid);

    expect(batchCreateBody(parsed)).toEqual({
      productId: valid.productId,
      batchNo: "KP-2026-1003-A",
      productionOrderNo: "ÜE-2026-0452",
      quantity: 1800,
      producedFrom: "2026-09-29",
      producedTo: "2026-10-17",
    });
  });

  it("reports the API's codes", () => {
    expect(codes({ ...valid, productId: "", quantity: "" })).toEqual(["productId:NotNull", "quantity:NotNull"]);
    expect(codes({ ...valid, quantity: "2,5" })).toEqual(["quantity:Integer"]);
    expect(codes({ ...valid, quantity: "0" })).toEqual(["quantity:Positive"]);
    expect(codes({ ...valid, batchNo: "KP 2026" })).toEqual(["batchNo:Pattern"]);
    expect(codes({ ...valid, producedTo: "2026-09-01" })).toEqual(["producedTo:DateRange"]);
  });

  it("sends an empty batch number as null: the API then assigns the next one", () => {
    expect(batchFormSchema.parse({ ...valid, batchNo: "" }).batchNo).toBeNull();
  });
});
