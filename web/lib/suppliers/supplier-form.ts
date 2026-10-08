import { nationalFromPhone, phoneFromNational, type SupplierType, supplierSchema } from "@tekpas/shared";
import { z } from "zod";
import type { SupplierCreateRequest, SupplierResponse, SupplierUpdateRequest } from "@/lib/api/suppliers";

/** What the supplier dialog edits; the phone is the national number typed after the fixed "+90". */
export interface SupplierFormValues {
  name: string;
  type: SupplierType | "";
  city: string;
  phone: string;
}

export function emptySupplierForm(): SupplierFormValues {
  return { name: "", type: "", city: "", phone: "" };
}

export function supplierFormFrom(supplier: SupplierResponse): SupplierFormValues {
  return {
    name: supplier.name,
    type: supplier.type as SupplierType,
    city: supplier.city ?? "",
    phone: nationalFromPhone(supplier.phone),
  };
}

/** The shared supplier rules (same codes as the API), with the typed phone turned into E.164 first. */
export const supplierFormSchema = z.preprocess(
  (values) =>
    typeof values === "object" && values !== null
      ? {
          ...values,
          type: (values as SupplierFormValues).type || undefined,
          phone: phoneFromNational(String((values as SupplierFormValues).phone ?? "")),
        }
      : values,
  supplierSchema,
);

export type SupplierFormOutput = z.output<typeof supplierSchema>;

export function supplierCreateBody(output: SupplierFormOutput): SupplierCreateRequest {
  return { name: output.name, type: output.type, city: output.city, phone: output.phone };
}

/**
 * PATCH with only what changed. Name, type and city are left out while locked (the company manages its own
 * details, or the type is tied to chain steps); the phone belongs to the link and always may change.
 */
export function supplierPatch(
  supplier: SupplierResponse,
  output: SupplierFormOutput,
  locks: { details: boolean; type: boolean },
): SupplierUpdateRequest {
  const patch: SupplierUpdateRequest = {};
  if (!locks.details) {
    if (output.name !== supplier.name) patch.name = output.name;
    if (!locks.type && output.type !== supplier.type) patch.type = output.type;
    if (output.city !== supplier.city) patch.city = output.city;
  }
  if (output.phone !== (supplier.phone ?? null)) patch.phone = output.phone;
  return patch;
}
