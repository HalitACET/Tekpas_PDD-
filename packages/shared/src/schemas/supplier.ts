import { z } from "zod";
import { PHONE_PATTERN, SUPPLIER_TYPES, TR_PROVINCES } from "../constants";

/**
 * Supplier form rules, the same as the backend's SupplierCreateRequest. Issue messages are field error codes
 * (FIELD_ERROR_CODES).
 */

const provinces: ReadonlySet<string> = new Set(TR_PROVINCES);

export const supplierSchema = z.object({
  name: z
    .string({ error: "NotBlank" })
    .trim()
    .min(1, { error: "NotBlank" })
    .max(200, { error: "Size" }),
  type: z.enum(SUPPLIER_TYPES, { error: (issue) => (issue.input == null ? "NotNull" : "SupplierType") }),
  city: z
    .string({ error: "NotBlank" })
    .trim()
    .min(1, { error: "NotBlank" })
    .refine((city) => provinces.has(city), { error: "City" }),
  phone: z
    .string()
    .regex(PHONE_PATTERN, { error: "Pattern" })
    .nullish()
    .transform((v) => v ?? null),
});

export type SupplierInput = z.input<typeof supplierSchema>;
export type SupplierValues = z.output<typeof supplierSchema>;

/**
 * A Turkish number as typed after the fixed "+90" ("532 418 77 90", "0224 000 00 00") → E.164
 * ("+905324187790"); "" → null. Anything else is returned unchanged so the schema reports it (Pattern).
 */
export function phoneFromNational(text: string): string | null {
  const digits = text.replace(/[\s().-]/g, "");
  if (digits === "") return null;
  const national = /^0\d{10}$/.test(digits) ? digits.slice(1) : digits;
  return /^[1-9]\d{9}$/.test(national) ? `+90${national}` : text;
}

/** "+905324187790" → "532 418 77 90" (for the field after "+90"); other countries' numbers stay whole. */
export function nationalFromPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}

/** "+902244412010" → "+90 224 441 20 10", as the supplier list shows it. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const national = nationalFromPhone(phone);
  return national === phone ? phone : `+90 ${national}`;
}
