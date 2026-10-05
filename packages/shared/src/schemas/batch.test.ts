import { describe, expect, it } from "vitest";
import { batchCreateSchema } from "./batch";

const valid = {
  productId: "20000000-0000-4000-8000-000000000001",
  batchNo: "KP-2026-1003-A",
  productionOrderNo: "UE-2026-1142",
  quantity: 5000,
  producedFrom: "2026-11-02",
  producedTo: "2026-11-20",
};

function codes(input: unknown): string[] {
  const result = batchCreateSchema.safeParse(input);
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}:${i.message}`).sort();
}

describe("batchCreateSchema", () => {
  it("accepts a valid batch", () => {
    expect(batchCreateSchema.parse(valid)).toEqual(valid);
  });

  it("treats an empty batch number as 'assign the next one'", () => {
    expect(batchCreateSchema.parse({ ...valid, batchNo: "" }).batchNo).toBeNull();
    expect(batchCreateSchema.parse({ ...valid, batchNo: undefined }).batchNo).toBeNull();
  });

  it("allows GS1 AI(10) characters only, up to 20", () => {
    expect(codes({ ...valid, batchNo: "A".repeat(20) })).toEqual([]);
    expect(codes({ ...valid, batchNo: "A".repeat(21) })).toEqual(["batchNo:Pattern"]);
    expect(codes({ ...valid, batchNo: "kp-2026" })).toEqual(["batchNo:Pattern"]);
    expect(codes({ ...valid, batchNo: "KP 2026" })).toEqual(["batchNo:Pattern"]);
  });

  it("requires a positive whole quantity", () => {
    expect(codes({ ...valid, quantity: 0 })).toEqual(["quantity:Positive"]);
    expect(codes({ ...valid, quantity: 2.5 })).toEqual(["quantity:Integer"]);
    expect(codes({ ...valid, quantity: Number.NaN })).toEqual(["quantity:Integer"]);
    expect(codes({ ...valid, quantity: undefined })).toEqual(["quantity:NotNull"]);
  });

  it("reports DateRange on producedTo when it is before producedFrom", () => {
    expect(codes({ ...valid, producedTo: "2026-11-01" })).toEqual(["producedTo:DateRange"]);
    expect(codes({ ...valid, producedTo: null })).toEqual([]);
  });
});
