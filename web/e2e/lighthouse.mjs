// Lighthouse accessibility audit of /login and the panel (/batches) against a running production
// build (pnpm build && pnpm start --port 3100) and a local backend with demo data.
//
//   DEMO_PASSWORD=... node e2e/lighthouse.mjs
//
// The panel restores its session from the refresh cookie, like a real browser after a reload: the
// script signs the demo user in through the API, then Lighthouse sends that cookie with its requests.
// Password and cookie stay in memory and in a temp dir that is deleted afterwards.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const password = process.env.DEMO_PASSWORD;
if (!password) {
  console.error("DEMO_PASSWORD is not set");
  process.exit(2);
}

async function refreshCookie() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@nilufergiyim.example", password, client: "WEB" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.headers.getSetCookie().find((c) => c.startsWith("tekpas_rt="))?.split(";")[0];
}

const work = mkdtempSync(path.join(tmpdir(), "kozapass-lh-"));
try {
  const results = {};
  const desktop = ["--form-factor=desktop", "--screenEmulation.width=1440", "--screenEmulation.height=900", "--screenEmulation.mobile=false"];
  const mobile = ["--form-factor=mobile", "--screenEmulation.width=390", "--screenEmulation.height=800", "--screenEmulation.mobile=true"];
  for (const [name, url, needsSession, emulation] of [
    ["login", `${BASE}/login`, false, desktop],
    ["login-mobile", `${BASE}/login`, false, mobile],
    ["panel-batches", `${BASE}/batches`, true, desktop],
    ["panel-batches-mobile", `${BASE}/batches`, true, mobile],
  ]) {
    const out = path.join(work, `${name}.json`);
    const args = [
      "-y",
      "lighthouse@12",
      url,
      "--only-categories=accessibility",
      "--output=json",
      `--output-path=${out}`,
      "--quiet",
      "--chrome-flags=--headless=new",
      "--screenEmulation.deviceScaleFactor=1",
      ...emulation,
    ];
    if (needsSession) {
      const headers = path.join(work, "headers.json");
      writeFileSync(headers, JSON.stringify({ Cookie: await refreshCookie() }));
      args.push(`--extra-headers=${headers}`);
    }
    execFileSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });

    const report = JSON.parse(readFileSync(out, "utf8"));
    const failed = Object.values(report.audits)
      .filter((a) => a.scoreDisplayMode === "binary" && a.score === 0)
      .map((a) => `${a.id}: ${(a.details?.items ?? []).map((i) => i.node?.snippet).join(" | ")}`);
    results[name] = {
      score: Math.round(report.categories.accessibility.score * 100),
      failed,
      // /login?next=… here would mean the session was not restored and the panel was not audited.
      finalUrl: report.finalDisplayedUrl,
    };
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
