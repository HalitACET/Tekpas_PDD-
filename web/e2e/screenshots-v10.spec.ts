import { test } from "@playwright/test";
import path from "node:path";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Design v1.0 (docs/design/v1.0/): care instructions on the product form and the passport, and the supplier's
 * contact person. Captures the design's frames as references for the implementation (docs/design/impl-v1.0/).
 * Run: pnpm --filter web e2e screenshots-v10
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v1.0");
const design = serveDesign(path.resolve(__dirname, "../../docs/design/v1.0"));

test("design v1.0 frames", async ({ page }) => {
  test.setTimeout(600_000);
  await captureDesignFrames(page, design.url("KozaPass_v1.0.dc.html"), OUT, [
    "120a", "120b", "120c", "120d", "121a", "121b", "121c", "121d", "121e", "121f", "121g",
    "130a", "130b", "130c", "131", "132a", "132b",
  ]);
});
