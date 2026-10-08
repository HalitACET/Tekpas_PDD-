import { describe, expect, it } from "vitest";
import type { SupplierResponse } from "@/lib/api/suppliers";
import { supplierFormFrom, supplierFormSchema, supplierPatch } from "./supplier-form";

const supplier: SupplierResponse = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Ege İplik San. Ltd.",
  type: "YARN",
  city: "Denizli",
  phone: "+902580000001",
  batchCount: 3,
  latestStepStatus: "APPROVED",
  editable: true,
  linkedAt: "2026-09-01T09:00:00Z",
};

describe("supplier form", () => {
  it("shows the stored phone as the national number and sends E.164 back", () => {
    const values = supplierFormFrom(supplier);
    expect(values.phone).toBe("258 000 00 01");
    expect(supplierFormSchema.parse({ ...values, phone: "0258 000 00 01" }).phone).toBe("+902580000001");
    expect(supplierFormSchema.parse({ ...values, phone: "" }).phone).toBeNull();
  });

  it("reports the API's codes for the typed values", () => {
    const result = supplierFormSchema.safeParse({ name: "X", type: "", city: "Atlantis", phone: "123" });
    expect(result.error?.issues.map((i) => `${i.path.join(".")}:${i.message}`).sort()).toEqual([
      "city:City",
      "phone:Pattern",
      "type:NotNull",
    ]);
  });

  it("patches only what changed and leaves locked fields out", () => {
    const output = supplierFormSchema.parse({ name: "Ege İplik A.Ş.", type: "FABRIC", city: "İzmir", phone: "" }) as never;

    expect(supplierPatch(supplier, output, { details: false, type: false })).toEqual({
      name: "Ege İplik A.Ş.",
      type: "FABRIC",
      city: "İzmir",
      phone: null,
    });
    expect(supplierPatch(supplier, output, { details: false, type: true })).toEqual({
      name: "Ege İplik A.Ş.",
      city: "İzmir",
      phone: null,
    });
    expect(supplierPatch(supplier, output, { details: true, type: true })).toEqual({ phone: null });
    const unchanged = supplierFormSchema.parse(supplierFormFrom(supplier)) as never;
    expect(supplierPatch(supplier, unchanged, { details: false, type: false })).toEqual({});
  });
});
