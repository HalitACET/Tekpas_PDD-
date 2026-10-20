/**
 * The cache tag of one passport page (docs/m6-plan.md §5.3). The page's data is cached under it until a publishing or a
 * withdrawal drops it (POST /api/passport-cache, called by the backend job). The code is the canonical one (GTIN-14,
 * upper-case batch number), so every spelling of the address shares one entry. Well under the 256-character limit.
 */
export function passportTag(gtin: string, batchNo: string): string {
  return `passport:${gtin}:${batchNo}`;
}
