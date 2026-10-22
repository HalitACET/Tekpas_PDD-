import { z } from "zod";

/**
 * Care instructions (design v1.0 120a, ISO 3758), the same rules as the backend's CareInfo: one symbol per group,
 * bars only where the symbol takes them, a note of at most 200 characters in the language it was written in.
 * Issue messages are the API's field error codes.
 */

/** The groups in label order, as the API's field names. */
export const CARE_CATEGORIES = ["washing", "bleaching", "drying", "ironing", "professional"] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

export const CARE_SYMBOLS_BY_CATEGORY = {
  washing: ["WASH_30", "WASH_40", "WASH_60", "WASH_95", "HAND_WASH", "DO_NOT_WASH"],
  bleaching: ["BLEACH_ANY", "BLEACH_OXYGEN_ONLY", "DO_NOT_BLEACH"],
  drying: ["TUMBLE_DRY_LOW", "TUMBLE_DRY_NORMAL", "DO_NOT_TUMBLE_DRY", "LINE_DRY", "DRY_FLAT", "DRY_IN_SHADE"],
  ironing: ["IRON_LOW", "IRON_MEDIUM", "IRON_HIGH", "DO_NOT_IRON"],
  professional: ["DRY_CLEAN_P", "DRY_CLEAN_F", "WET_CLEAN", "DO_NOT_PROFESSIONAL_CLEAN"],
} as const satisfies Record<CareCategory, readonly string[]>;

export type CareSymbol = (typeof CARE_SYMBOLS_BY_CATEGORY)[CareCategory][number];
export const CARE_SYMBOLS = CARE_CATEGORIES.flatMap((c) => CARE_SYMBOLS_BY_CATEGORY[c]) as readonly CareSymbol[];

/** The bars under a symbol: none, one (gentle), two (very gentle). */
export const GENTLENESS = ["NORMAL", "GENTLE", "VERY_GENTLE"] as const;
export type Gentleness = (typeof GENTLENESS)[number];

/** Temperature washes take one or two bars; P, F and W one; every other symbol none. */
export function gentlestFor(symbol: CareSymbol): Gentleness {
  if (/^WASH_\d+$/.test(symbol)) return "VERY_GENTLE";
  if (symbol === "DRY_CLEAN_P" || symbol === "DRY_CLEAN_F" || symbol === "WET_CLEAN") return "GENTLE";
  return "NORMAL";
}

/** The bars a symbol can carry, in order ("NORMAL" first); a single entry means the symbol takes none. */
export function gentlenessOptions(symbol: CareSymbol): Gentleness[] {
  return GENTLENESS.slice(0, GENTLENESS.indexOf(gentlestFor(symbol)) + 1);
}

export const CARE_NOTE_MAX = 200;
export const CARE_NOTE_LANGUAGES = ["tr", "en", "de"] as const;

function instructionSchema(category: CareCategory) {
  const symbols: readonly string[] = CARE_SYMBOLS_BY_CATEGORY[category];
  return z
    .object({ symbol: z.string(), gentleness: z.enum(GENTLENESS).nullish() })
    .superRefine((value, ctx) => {
      if (!symbols.includes(value.symbol)) {
        ctx.addIssue({ code: "custom", message: "CareSymbolIn", path: [] });
        return;
      }
      const gentleness = value.gentleness ?? "NORMAL";
      if (GENTLENESS.indexOf(gentleness) > GENTLENESS.indexOf(gentlestFor(value.symbol as CareSymbol))) {
        ctx.addIssue({ code: "custom", message: "CareGentleness", path: [] });
      }
    })
    .transform((value) => ({ symbol: value.symbol as CareSymbol, gentleness: value.gentleness ?? "NORMAL" }))
    .nullish()
    .transform((value) => value ?? null);
}

export const careInfoSchema = z
  .object({
    washing: instructionSchema("washing"),
    bleaching: instructionSchema("bleaching"),
    drying: instructionSchema("drying"),
    ironing: instructionSchema("ironing"),
    professional: instructionSchema("professional"),
    note: z
      .string()
      .nullish()
      .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
      .pipe(z.string().max(CARE_NOTE_MAX, { error: "Size" }).nullable()),
    noteLanguage: z.enum(CARE_NOTE_LANGUAGES, { error: "Pattern" }).nullish(),
  })
  .transform((v) => ({ ...v, noteLanguage: v.note === null ? null : (v.noteLanguage ?? "tr") }));

export type CareInfoInput = z.input<typeof careInfoSchema>;
export type CareInfoValues = z.output<typeof careInfoSchema>;

/** Nothing chosen and no note: stored as none, and the passport shows no care section. */
export function isCareEmpty(care: CareInfoValues | null | undefined): boolean {
  return !care || (CARE_CATEGORIES.every((c) => care[c] === null) && care.note === null);
}
