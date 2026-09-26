// Canlı ortam kontrolü: web origin'i üzerinden (K18) login → /auth/me → cookie ile refresh.
// Kullanım:  node scripts/live-check.mjs https://<vercel-production-adresi>
// DEMO_PASSWORD ortam değişkeninden okunur, yoksa ekrana yazılmadan sorulur. Çıktıda token veya cookie değeri gösterilmez.
import readline from "node:readline";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base.startsWith("https://")) {
  console.error("Kullanım: node scripts/live-check.mjs https://<vercel-production-adresi>");
  process.exit(2);
}

const password = process.env.DEMO_PASSWORD ?? (await askHidden("DEMO_PASSWORD: "));
const email = "admin@nilufergiyim.example";

const home = await fetch(base + "/", { redirect: "manual" });
const html = home.status === 200 ? await home.text() : "";
// The page streams a "checking" placeholder first, then the real badge: take the last one.
const badge = [...html.matchAll(/(Sunucu|Server)<!-- -->: <!-- -->([^<]+)/g)].at(-1)?.[2] ?? "(rozet bulunamadı)";
console.log(`sayfa             ${home.status}  rozet: ${badge}`);
if (home.status >= 300 && home.status < 400) {
  console.log("  → yönlendirme var: bu adres Vercel Deployment Protection arkasında, production adresini kullan.");
  process.exit(1);
}

const login = await fetch(base + "/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, client: "WEB" }),
});
const setCookie = login.headers.get("set-cookie") ?? "";
const loginBody = await login.json().catch(() => ({}));
console.log(`login (WEB)       ${login.status}  cookie: ${setCookie.replace(/tekpas_rt=[^;]+/, "tekpas_rt=<gizli>")}`);
const flags = ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth"].map(
  (f) => `${f}=${setCookie.toLowerCase().includes(f.toLowerCase()) ? "✓" : "✗"}`,
);
console.log(`  bayraklar       ${flags.join("  ")}`);
if (login.status !== 200) process.exit(1);

const me = await fetch(base + "/api/v1/auth/me", {
  headers: { Authorization: `Bearer ${loginBody.accessToken}` },
});
const meBody = await me.json().catch(() => ({}));
console.log(`me                ${me.status}  firma: ${meBody.company?.name} (${meBody.company?.type}), rol: ${meBody.role}`);

const cookie = setCookie.split(";")[0];
const refresh = await fetch(base + "/api/v1/auth/refresh", { method: "POST", headers: { Cookie: cookie } });
const rotated = (refresh.headers.get("set-cookie") ?? "").split(";")[0];
console.log(`refresh (cookie)  ${refresh.status}  yeni cookie: ${rotated && rotated !== cookie ? "✓ döndürüldü" : "✗"}`);

async function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : "");
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}
