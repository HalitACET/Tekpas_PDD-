# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshots.spec.ts >> design references >> capture
- Location: e2e\screenshots.spec.ts:96:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0

Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Test source

```ts
  9   |  * design-*.png come from the approved design file, impl-*.png from the app, same size and state.
  10  |  * Run: pnpm --filter web e2e screenshots
  11  |  */
  12  | const OUT = path.resolve(__dirname, "../../docs/design/impl-v0.2");
  13  | const DESIGN_DIR = path.resolve(__dirname, "../../docs/design/v0.2");
  14  | 
  15  | const DESKTOP = { width: 1440, height: 900 };
  16  | const MOBILE = { width: 390, height: 844 };
  17  | const FORM = { email: "elif@karacatekstil.com.tr", password: "yanlissifre" };
  18  | 
  19  | type LoginState = "default" | "error" | "loading";
  20  | 
  21  | async function openLogin(page: Page, state: LoginState) {
  22  |   await mockAuthApi(page, { signedIn: false, login: state === "error" ? "invalid" : "hang" });
  23  |   await page.goto("/login");
  24  |   await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
  25  |   if (state === "default") return;
  26  |   await page.getByLabel("E-posta").fill(FORM.email);
  27  |   await page.getByLabel("Şifre", { exact: true }).fill(FORM.password);
  28  |   await page.getByRole("button", { name: "Giriş yap" }).click();
  29  |   if (state === "error") await expect(page.getByRole("alert").filter({ hasText: "E-posta veya şifre hatalı." })).toBeVisible();
  30  |   else await expect(page.getByRole("button", { name: "Giriş yapılıyor…" })).toBeVisible();
  31  | }
  32  | 
  33  | async function settle(page: Page) {
  34  |   await page.evaluate(() => document.fonts.ready);
  35  |   await page.mouse.move(0, 0);
  36  | }
  37  | 
  38  | for (const scheme of ["light", "dark"] as const) {
  39  |   test.describe(`${scheme} theme`, () => {
  40  |     test.use({ colorScheme: scheme });
  41  | 
  42  |     for (const state of ["default", "error", "loading"] as const) {
  43  |       test(`login desktop ${state}`, async ({ page }) => {
  44  |         await page.setViewportSize(DESKTOP);
  45  |         await openLogin(page, state);
  46  |         await settle(page);
  47  |         await page.screenshot({ path: `${OUT}/impl-login-desktop-${state}-${scheme}.png` });
  48  |       });
  49  | 
  50  |       test(`login mobile ${state}`, async ({ page }) => {
  51  |         await page.setViewportSize(MOBILE);
  52  |         await openLogin(page, state);
  53  |         await settle(page);
  54  |         await page.screenshot({ path: `${OUT}/impl-login-mobile-${state}-${scheme}.png` });
  55  |       });
  56  |     }
  57  | 
  58  |     test("panel batches desktop", async ({ page }) => {
  59  |       await page.setViewportSize(DESKTOP);
  60  |       await mockAuthApi(page, { signedIn: true });
  61  |       await page.goto("/batches");
  62  |       await expect(page.getByRole("heading", { level: 1, name: "Partiler" })).toBeVisible();
  63  |       await settle(page);
  64  |       await page.screenshot({ path: `${OUT}/impl-panel-batches-desktop-${scheme}.png` });
  65  |     });
  66  |   });
  67  | }
  68  | 
  69  | test.describe("design references", () => {
  70  |   // The design canvas (third-party support.js) sometimes never lays out a frame; a fresh page fixes it.
  71  |   // The references are static files, so a retry is enough here.
  72  |   test.describe.configure({ retries: 2 });
  73  |   // The design canvas (support.js) needs http, not file://: serve the committed copy locally.
  74  |   let server: Server;
  75  |   let designUrl: string;
  76  | 
  77  |   test.beforeAll(async () => {
  78  |     server = createServer(async (req, res) => {
  79  |       try {
  80  |         const file = path.join(DESIGN_DIR, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  81  |         if (!file.startsWith(DESIGN_DIR)) throw new Error("outside design dir");
  82  |         const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
  83  |         const body = await readFile(file);
  84  |         res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` }).end(body);
  85  |       } catch {
  86  |         res.writeHead(404).end();
  87  |       }
  88  |     });
  89  |     await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  90  |     const { port } = server.address() as { port: number };
  91  |     designUrl = `http://127.0.0.1:${port}/KozaPass_Ekranlar.dc.html`;
  92  |   });
  93  | 
  94  |   test.afterAll(() => server.close());
  95  | 
  96  |   test("capture", async ({ page }) => {
  97  |     test.setTimeout(120_000);
  98  |     await page.setViewportSize({ width: 1600, height: 1000 });
  99  |     await page.goto(designUrl);
  100 |     await page.locator('[data-screen-label="Login masaüstü"]').first().waitFor({ state: "attached", timeout: 60_000 });
  101 |     await settle(page);
  102 | 
  103 |     // Crop from a full-page capture by each screen's box (the design canvas can report its frames as
  104 |     // not "visible" to Playwright's element screenshot).
  105 |     const crop = async (selector: string, index: number, file: string) => {
  106 |       const frame = page.locator(selector).nth(index);
  107 |       // The canvas renders frames lazily: bring each into view and wait until it has a real size.
  108 |       await frame.evaluate((el) => el.scrollIntoView({ block: "start" }));
> 109 |       await expect.poll(() => frame.evaluate((el) => el.getBoundingClientRect().width), { timeout: 30_000 }).toBeGreaterThan(0);
      |                                                                                                              ^ Error: expect(received).toBeGreaterThan(expected)
  110 |       const box = await frame.evaluate((el) => {
  111 |         const r = el.getBoundingClientRect();
  112 |         return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  113 |       });
  114 |       await page.screenshot({ path: `${OUT}/${file}`, fullPage: true, clip: box });
  115 |     };
  116 | 
  117 |     const states: LoginState[] = ["default", "error", "loading"];
  118 |     for (const [i, state] of states.entries()) {
  119 |       await crop('[data-screen-label="Login masaüstü"]', i, `design-login-desktop-${state}.png`);
  120 |       await crop('[data-screen-label="Login mobil"]', i, `design-login-mobile-${state}.png`);
  121 |     }
  122 |     // The label sits on a full-width wrapper; the 1440 × 900 screen is its first child.
  123 |     await crop('[data-screen-label="Panel"] > div', 0, "design-panel-batches-desktop-light.png");
  124 |     await crop('[data-screen-label="Panel"] > div', 1, "design-panel-batches-desktop-dark.png");
  125 |   });
  126 | });
  127 | 
```