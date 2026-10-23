import { test } from "@playwright/test";
import path from "node:path";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Design v1.2 (docs/design/v1.2/): users and roles, accepting an invitation, the audit trail.
 * Captures the design's frames as references for the implementation (docs/design/impl-v1.2/).
 * Run: pnpm --filter web e2e screenshots-v12
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v1.2");
const design = serveDesign(path.resolve(__dirname, "../../docs/design/v1.2"));

test("design v1.2 frames", async ({ page }) => {
  test.setTimeout(1_200_000);
  await captureDesignFrames(page, design.url("KozaPass_v1.2.dc.html"), OUT, [
    "160", "161", "162", "163", "164", "165", "165b", "166", "167", "167b", "168a", "168b", "168c", "169",
    "170", "171", "172", "173", "174",
    "180", "181", "182", "183a", "183b", "184",
  ]);
});
