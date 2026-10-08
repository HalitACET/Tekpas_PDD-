import { describe, expect, it } from "vitest";
import { TR_PROVINCES } from "../constants";
import { formatPhone, nationalFromPhone, phoneFromNational, supplierSchema } from "./supplier";

const valid = { name: "Aras Örme Konfeksiyon", type: "SEWING", city: "İzmir", phone: "+902240000000" };

function codes(input: unknown): string[] {
  const result = supplierSchema.safeParse(input);
  return (result.error?.issues ?? []).map((i) => `${i.path.join(".")}:${i.message}`).sort();
}

describe("supplierSchema", () => {
  it("accepts a valid supplier, with or without a phone", () => {
    expect(supplierSchema.parse(valid)).toEqual(valid);
    expect(supplierSchema.parse({ ...valid, phone: null }).phone).toBeNull();
  });

  it("reports the API's field codes", () => {
    expect(codes({ ...valid, name: "  " })).toEqual(["name:NotBlank"]);
    expect(codes({ ...valid, type: "MANUFACTURER" })).toEqual(["type:SupplierType"]);
    expect(codes({ ...valid, city: "Paris" })).toEqual(["city:City"]);
    expect(codes({ ...valid, city: "bursa" })).toEqual(["city:City"]);
    expect(codes({ ...valid, phone: "0532 418 77 90" })).toEqual(["phone:Pattern"]);
  });
});

describe("TR_PROVINCES", () => {
  it("has the 81 provinces in Turkish alphabetical order", () => {
    expect(TR_PROVINCES).toHaveLength(81);
    expect(new Set(TR_PROVINCES).size).toBe(81);
    expect([...TR_PROVINCES].sort((a, b) => a.localeCompare(b, "tr"))).toEqual([...TR_PROVINCES]);
    expect(TR_PROVINCES.indexOf("Çanakkale")).toBe(TR_PROVINCES.indexOf("Bursa") + 1);
    expect(TR_PROVINCES.indexOf("İstanbul")).toBe(TR_PROVINCES.indexOf("Isparta") + 1);
  });
});

describe("phone helpers", () => {
  it("turns a typed Turkish number into E.164", () => {
    expect(phoneFromNational("532 418 77 90")).toBe("+905324187790");
    expect(phoneFromNational("0224 000 00 00")).toBe("+902240000000");
    expect(phoneFromNational("(224) 000-00-00")).toBe("+902240000000");
    expect(phoneFromNational("  ")).toBeNull();
    expect(phoneFromNational("12345")).toBe("12345");
    expect(phoneFromNational("0023 456 78 90")).toBe("0023 456 78 90");
  });

  it("shows numbers the design's way", () => {
    expect(nationalFromPhone("+902244412010")).toBe("224 441 20 10");
    expect(formatPhone("+902244412010")).toBe("+90 224 441 20 10");
    expect(formatPhone("+4930123456")).toBe("+4930123456");
    expect(formatPhone(null)).toBe("");
  });
});
