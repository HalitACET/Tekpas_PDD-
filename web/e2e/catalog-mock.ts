import type { Page, Route } from "@playwright/test";

/**
 * Browser-side stand-in for /api/v1/products, with the design's sample products (v0.3 01) so the
 * screenshots compare side by side with the design. GTINs are from the GS1 restricted circulation range
 * (020–029): the design's 0869… numbers are visual examples only.
 */

/** Fixed "now" of the screenshots and tests: 3 Oct 2026, 15:00 local time. */
export const NOW = new Date(2026, 9, 3, 15, 0);

const at = (month: number, day: number, hour = 9, minute = 0) => new Date(2026, month, day, hour, minute).toISOString();

export interface MockProduct {
  id: string;
  gtin: string;
  sku: string | null;
  name: string;
  category: string;
  description: string | null;
  declaredFiberComposition: { fiber: string; percent: number }[] | null;
  batchCount: number;
  createdAt: string;
  updatedAt: string;
}

export function designProducts(): MockProduct[] {
  const p = (
    n: number,
    gtin: string,
    name: string,
    sku: string,
    category: string,
    fibers: [string, number][],
    batchCount: number,
    updatedAt: string,
    description: string | null = null,
  ): MockProduct => ({
    id: `20000000-0000-4000-8000-00000000000${n}`,
    gtin,
    sku,
    name,
    category,
    description,
    declaredFiberComposition: fibers.map(([fiber, percent]) => ({ fiber, percent })),
    batchCount,
    createdAt: at(7, 1),
    updatedAt,
  });
  return [
    p(1, "02012345000018", "Organik pamuk tişört, ekru", "KT-TS-0142", "T_SHIRT", [["ORGANIC_COTTON", 95], ["ELASTANE", 5]], 4, at(9, 3, 14, 32), "Yuvarlak yaka, 180 g/m² süprem."),
    p(2, "02012345000025", "Keten gömlek, lacivert", "KT-GM-0087", "SHIRT", [["LINEN", 100]], 2, at(9, 2, 11, 0)),
    p(3, "02012345000032", "Denim pantolon, taşlanmış", "KT-PN-0213", "TROUSERS", [["COTTON", 98], ["ELASTANE", 2]], 3, at(8, 12)),
    p(4, "02012345000049", "Merino triko kazak", "KT-TR-0031", "KNITWEAR", [["WOOL", 80], ["POLYAMIDE", 20]], 1, at(8, 9)),
    p(5, "02012345000056", "Viskon elbise, desenli", "KT-EL-0055", "DRESS", [["VISCOSE", 100]], 0, at(8, 3)),
    p(6, "02012345000063", "Pamuklu sweatshirt, gri melanj", "KT-SW-0120", "SWEATSHIRT", [["COTTON", 80], ["RECYCLED_POLYESTER", 20]], 2, at(7, 28)),
    p(7, "02012345000070", "Bebek body, organik", "KT-BB-0009", "BABY", [["ORGANIC_COTTON", 100]], 0, at(7, 21)),
  ];
}

const problem = (route: Route, status: number, body: Record<string, unknown>) =>
  route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, ...body }) });

/** List rows carry everything but the description (ProductListItem). */
function listItem(product: MockProduct) {
  const item: Partial<MockProduct> = { ...product };
  delete item.description;
  return item;
}

interface CatalogOptions {
  products?: MockProduct[];
  /** GTINs (14 digits) that belong to another company: a save answers 409 without naming it. */
  foreignGtins?: string[];
  /** Answer every list request with a 500. */
  failLists?: boolean;
}

/** Installs the mock; returns the live product array so tests can inspect what was saved. */
export async function mockCatalogApi(page: Page, { products = designProducts(), foreignGtins = [], failLists = false }: CatalogOptions = {}) {
  const store = products;
  const pad = (gtin: string) => gtin.padStart(14, "0");
  const gtinTaken = (gtin: string, exceptId?: string) =>
    foreignGtins.includes(gtin) || store.some((p) => p.gtin === gtin && p.id !== exceptId);
  const taken = (route: Route) =>
    problem(route, 409, {
      type: "urn:tekpas:problem:conflict",
      title: "Conflict",
      detail: "A product with this GTIN already exists",
      errors: [{ field: "gtin", code: "Unique", message: "A product with this GTIN already exists" }],
    });

  await page.route(/\/api\/v1\/products(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (failLists) return problem(route, 500, { type: "urn:tekpas:problem:internal", title: "Internal server error" });
      const url = new URL(request.url());
      const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr");
      const category = url.searchParams.get("category");
      const size = Number(url.searchParams.get("size") ?? 20);
      const matches = store
        .filter((p) => !category || p.category === category)
        .filter((p) => !q || [p.name, p.sku ?? "", p.gtin].some((v) => v.toLocaleLowerCase("tr").includes(q)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return route.fulfill({
        json: {
          content: matches.slice(0, size).map(listItem),
          page: 0,
          size,
          totalElements: matches.length,
          totalPages: Math.ceil(matches.length / size),
        },
      });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      if (gtinTaken(body.gtin)) return taken(route);
      const now = new Date().toISOString();
      const created: MockProduct = {
        id: `20000000-0000-4000-8000-${String(store.length + 100).padStart(12, "0")}`,
        gtin: pad(body.gtin),
        sku: body.sku ?? null,
        name: body.name,
        category: body.category,
        description: body.description ?? null,
        declaredFiberComposition: body.declaredFiberComposition ?? null,
        batchCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      store.unshift(created);
      return route.fulfill({ status: 201, json: created });
    }
    return route.fallback();
  });

  await page.route(/\/api\/v1\/products\/[0-9a-f-]+$/, async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").pop();
    const product = store.find((p) => p.id === id);
    if (!product) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
    if (request.method() === "GET") return route.fulfill({ json: product });
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      if (body.gtin !== undefined) {
        if (product.batchCount > 0 && body.gtin !== product.gtin) {
          return problem(route, 409, { type: "urn:tekpas:problem:gtin-locked", title: "Conflict", reason: "GTIN_LOCKED" });
        }
        if (gtinTaken(body.gtin, product.id)) return taken(route);
      }
      Object.assign(product, body, { updatedAt: new Date().toISOString() });
      return route.fulfill({ json: product });
    }
    if (request.method() === "DELETE") {
      if (product.batchCount > 0) {
        return problem(route, 409, { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "PRODUCT_HAS_BATCHES" });
      }
      store.splice(store.indexOf(product), 1);
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });

  return store;
}
