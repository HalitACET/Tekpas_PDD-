// A stand-in for the backend's public passport endpoint (M12 T5), started by Playwright next to `next start`.
// The passport page renders on the server and fetches the passport there, so page.route cannot answer it.
// Only GET /api/v1/public/passports/01/{gtin}/10/{batch} is answered; every other request is dropped, as when no
// backend runs (the panel's tests mock their requests in the browser).
import { createServer } from "node:http";

const PORT = Number(process.env.PASSPORT_BACKEND_PORT ?? 3199);

const care = {
  washing: { symbol: "WASH_40", gentleness: "GENTLE" },
  bleaching: { symbol: "DO_NOT_BLEACH", gentleness: "NORMAL" },
  ironing: { symbol: "IRON_MEDIUM", gentleness: "NORMAL" },
  note: "Ters çevirerek yıkayın.",
  noteLanguage: "tr",
};

/** Published, translated into English (partly with AI) and only partly into German. */
const published = {
  verificationCode: "7Q4K-2M9X",
  snapshot: {
    schemaVersion: 3,
    passport: { version: 2, publishedAt: "2026-10-20T09:12:00Z", gtin: "08690123456789", batchNo: "KP-2026-0915-A" },
    manufacturer: { name: "Nilüfer Giyim A.Ş.", city: "Bursa", country: "TR" },
    product: {
      name: "Organik Pamuk Polo",
      category: "T_SHIRT",
      description: "Yuvarlak yaka, kısa kollu basic tişört.",
      fiberComposition: [{ fiber: "ORGANIC_COTTON", percent: 100 }],
      care,
    },
    batch: {},
    supplyChain: [
      { key: "s1", type: "FIBER", approved: true, approvedAt: "2026-09-14T10:00:00Z", inputs: [], certificates: [], data: { fiberType: "ORGANIC_COTTON", originCountry: "TR", originRegion: "Şanlıurfa" } },
      { key: "s2", type: "YARN", approved: true, approvedAt: "2026-09-16T10:00:00Z", inputs: ["s1"], actor: { name: "Ege İplik", city: "Denizli", country: "TR" }, certificates: ["c1"], data: { yarnCount: "Ne 30/1" } },
      { key: "s3", type: "FABRIC", approved: true, approvedAt: "2026-09-18T10:00:00Z", inputs: ["s2"], actor: { name: "Demirtaş Örme Kumaş", city: "Bursa", country: "TR" }, certificates: [], data: { fabricType: "Süprem örme", gsm: 180 } },
    ],
    certificates: [
      { key: "c1", type: "GOTS", certNo: "CU 1047561-GOTS-2026", holder: "Ege İplik", issuer: "Control Union", validFrom: "2026-03-14", validUntil: "2099-03-13" },
    ],
    translations: [
      { field: "product.description", language: "en", text: "Crew-neck, short-sleeved basic T-shirt.", aiAssisted: true },
      { field: "product.care.note", language: "en", text: "Wash inside out.", aiAssisted: false },
      { field: "s3.fabricType", language: "en", text: "Single jersey knit", aiAssisted: true },
      { field: "product.description", language: "de", text: "Basic-T-Shirt mit Rundhalsausschnitt.", aiAssisted: false },
    ],
  },
};

const answers = {
  "08690123456789/KP-2026-0915-A": { status: 200, body: published },
  "08690123456796/KP-2026-0901-A": { status: 410, body: { withdrawnAt: "2026-10-21T08:00:00Z" } },
};

createServer((request, response) => {
  const match = /^\/api\/v1\/public\/passports\/01\/(\d{14})\/10\/([^/?]+)$/.exec(request.url ?? "");
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method !== "GET" || !match) {
    request.socket.destroy();
    return;
  }
  const answer = answers[`${match[1]}/${decodeURIComponent(match[2])}`] ?? { status: 404, body: { status: 404 } };
  response.writeHead(answer.status, { "content-type": "application/json" }).end(JSON.stringify(answer.body));
}).listen(PORT, () => console.log(`passport backend on ${PORT}`));
