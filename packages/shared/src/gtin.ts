/**
 * GS1 GTIN rules, the same as the backend (com.tekpas.product.Gtin) and tested against the same cases
 * (test-vectors/gtin.json). GTIN-8, -12, -13 and -14 are accepted and stored as 14 digits.
 */

const ACCEPTED = /^(\d{8}|\d{12,14})$/;

/** 8, 12, 13 or 14 digits, nothing else (no spaces or dashes). */
export function hasAcceptedGtinFormat(value: string): boolean {
  return ACCEPTED.test(value);
}

/** GS1 mod 10: from the right, digits are weighted 3, 1, 3, 1, ... */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  for (let i = 0; i < digitsWithoutCheck.length; i++) {
    const digit = Number(digitsWithoutCheck[digitsWithoutCheck.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True if the last digit is the check digit of the others. False for anything that is not a GTIN. */
export function hasValidGtinCheckDigit(value: string): boolean {
  if (!hasAcceptedGtinFormat(value)) return false;
  return gtinCheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

/** The 14-digit form (what the API stores and returns). Throws for anything that is not a GTIN. */
export function normalizeGtin(value: string): string {
  if (!hasAcceptedGtinFormat(value)) throw new Error("Not a GTIN-8/12/13/14");
  return value.padStart(14, "0");
}
