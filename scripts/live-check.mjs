// Canlı ortam kontrolü: web origin'i üzerinden (K18) login sayfası → login → /auth/me → ürün ve parti
// listeleri (demo verisi) → cookie ile refresh.
// Kullanım:  node scripts/live-check.mjs https://<vercel-production-adresi>
// DEMO_PASSWORD ortam değişkeninden okunur, yoksa ekrana yazılmadan sorulur. Çıktıda token veya cookie değeri gösterilmez.
// İstekler tarayıcı gibi Origin başlığı taşır: proxy bu başlığı backend'e iletir (CORS 403 hatası böyle yakalanır).
import readline from "node:readline";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base.startsWith("https://") && !base.startsWith("http://localhost")) {
  console.error("Kullanım: node scripts/live-check.mjs https://<vercel-production-adresi>");
  process.exit(2);
}

const password = process.env.DEMO_PASSWORD ?? (await askHidden("DEMO_PASSWORD: "));
const email = "admin@nilufergiyim.example";
const origin = { Origin: new URL(base).origin };

const page = await fetch(base + "/login", { redirect: "manual" });
const html = page.status === 200 ? await page.text() : "";
const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "(başlık yok)";
console.log(`login sayfası     ${page.status}  başlık: ${title}`);
if (page.status >= 300 && page.status < 400) {
  console.log("  → yönlendirme var: bu adres Vercel Deployment Protection arkasında, production adresini kullan.");
  process.exit(1);
}

const login = await fetch(base + "/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...origin },
  body: JSON.stringify({ email, password, client: "WEB" }),
});
const setCookies = login.headers.getSetCookie();
const refreshCookie = setCookies.find((c) => c.startsWith("tekpas_rt=")) ?? "";
const loginBody = await login.json().catch(() => ({}));
console.log(`login (WEB)       ${login.status}  cookie: ${refreshCookie.replace(/tekpas_rt=[^;]+/, "tekpas_rt=<gizli>")}`);
const flags = ["HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth"].map(
  (f) => `${f}=${refreshCookie.toLowerCase().includes(f.toLowerCase()) ? "✓" : "✗"}`,
);
console.log(`  bayraklar       ${flags.join("  ")}`);
if (login.status !== 200) {
  if (login.status === 403) console.log("  → 403: backend Origin başlığını CORS olarak reddediyor (bkz. SecurityConfig, K18).");
  process.exit(1);
}

const me = await fetch(base + "/api/v1/auth/me", {
  headers: { Authorization: `Bearer ${loginBody.accessToken}`, ...origin },
});
const meBody = await me.json().catch(() => ({}));
console.log(`me                ${me.status}  firma: ${meBody.company?.name} (${meBody.company?.type}), rol: ${meBody.role}`);

// Demo verisi (DemoDataSeeder): Nilüfer Giyim'de 3 ürün ve 5 parti.
const auth = { Authorization: `Bearer ${loginBody.accessToken}`, ...origin };
const products = await fetch(base + "/api/v1/products?sort=name", { headers: auth });
const productsBody = await products.json().catch(() => ({}));
const productNames = (productsBody.content ?? []).map((p) => `${p.name} (${p.batchCount})`).join(", ");
console.log(`ürünler           ${products.status}  ${productsBody.totalElements ?? "?"} adet: ${productNames}`);
const batches = await fetch(base + "/api/v1/batches?sort=batchNo", { headers: auth });
const batchesBody = await batches.json().catch(() => ({}));
const batchNos = (batchesBody.content ?? []).map((b) => `${b.batchNo} ${b.status}`).join(", ");
console.log(`partiler          ${batches.status}  ${batchesBody.totalElements ?? "?"} adet: ${batchNos}`);

// Tarayıcı gibi: süresi dolmuş olabilecek access token'ı da gönder; refresh yine çalışmalı.
const cookie = refreshCookie.split(";")[0];
const refresh = await fetch(base + "/api/v1/auth/refresh", {
  method: "POST",
  headers: { Cookie: cookie, Authorization: "Bearer expired", ...origin },
});
const rotated = (refresh.headers.getSetCookie().find((c) => c.startsWith("tekpas_rt=")) ?? "").split(";")[0];
console.log(`refresh (cookie)  ${refresh.status}  yeni cookie: ${rotated && rotated !== cookie ? "✓ döndürüldü" : "✗"}`);

async function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : "");
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}
