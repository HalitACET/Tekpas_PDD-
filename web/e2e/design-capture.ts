import { expect, type Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

/**
 * Serves a Claude Design folder (docs/design/vX) on a free local port, so the design canvas can be opened
 * in the test browser and its frames captured as reference screenshots.
 */
export function serveDesign(dir: string) {
  let server: Server;
  let origin = "";

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const file = path.join(dir, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
        if (!file.startsWith(dir)) throw new Error("outside design dir");
        const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    origin = `http://127.0.0.1:${port}`;
  });

  test.afterAll(() => server.close());

  return { url: (file: string) => `${origin}/${encodeURIComponent(file)}` };
}

/**
 * Opens a design canvas and saves each top-level frame ("NN …") whose number is in `frames`, light and dark
 * side by side in the canvas, as `<out>/design-NN-<theme>.png`. Skips the test when the canvas cannot load
 * React from unpkg.com.
 */
export async function captureDesignFrames(page: Page, url: string, out: string, frames: number[]) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  // Some networks block unpkg.com; jsDelivr serves the same npm files under the same path.
  await page.route("https://unpkg.com/**", async (route) => {
    const mirror = route.request().url().replace("https://unpkg.com/", "https://cdn.jsdelivr.net/npm/");
    try {
      await route.fulfill({ response: await route.fetch({ url: mirror }) });
    } catch {
      await route.continue();
    }
  });
  let offline = false;
  page.on("pageerror", (error) => {
    if (error.message.includes("unpkg.com")) offline = true;
  });
  await page.goto(url);
  await page.locator("[data-screen-label]").first().waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(5_000); // the canvas lays itself out after load
  test.skip(offline, "design canvas needs unpkg.com (React), which is not reachable");

  // Top-level frames only; the panels inside carry labels of their own.
  const found = await page.$$eval("[data-screen-label]", (els) =>
    els
      .map((e) => /^(\d\d) /.exec(e.getAttribute("data-screen-label") ?? "")?.[1])
      .flatMap((n, i) => {
        if (!n) return [];
        els[i].setAttribute("data-cap", n);
        return [Number(n)];
      }),
  );
  expect(found).toEqual(expect.arrayContaining(frames));

  for (const number of frames) {
    const n = String(number).padStart(2, "0");
    const label = page.locator(`[data-cap="${n}"]`).first();
    for (const [j, scheme] of (["light", "dark"] as const).entries()) {
      // The canvas renders a frame once its label is scrolled into view.
      await label.evaluate((el) => el.scrollIntoView({ block: "start" }));
      const frame = label.locator(":scope > div").nth(1).locator(":scope > div").nth(j);
      await expect.poll(() => frame.evaluate((el) => el.getBoundingClientRect().width), { timeout: 30_000 }).toBeGreaterThan(100);
      await page.waitForTimeout(500);
      const box = await frame.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
      await page.screenshot({ path: `${out}/design-${n}-${scheme}.png`, fullPage: true, clip: box });
    }
  }
}
