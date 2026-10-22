import { test } from "@playwright/test";
import path from "node:path";
import { captureDesignFrames, serveDesign } from "./design-capture";

/*
 * Design v1.1 (docs/design/v1.1/): translations before publishing, translated texts on the passport, Excel import.
 * Captures the design's frames as references for the implementation (docs/design/impl-v1.1/).
 * Run: pnpm --filter web e2e screenshots-v11
 */
const OUT = path.resolve(__dirname, "../../docs/design/impl-v1.1");
const design = serveDesign(path.resolve(__dirname, "../../docs/design/v1.1"));

test("design v1.1 frames", async ({ page }) => {
  test.setTimeout(1_200_000);
  await captureDesignFrames(page, design.url("KozaPass_v1.1.dc.html"), OUT, [
    "140a", "140b", "140c", "140d", "140e", "140f", "140g", "140h", "140i", "140j", "140k", "140l",
    "141a", "141b", "141c", "141d", "141e", "141f",
    "150", "151", "152", "153a", "153b", "154a", "154b", "154c", "154d", "154e", "154f", "154g", "155a", "155b",
    "156", "157a", "157b",
  ]);
});
