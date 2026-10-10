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

/** The design's list error (v0.3.1 20): the server answered 503 with this request id. */
export const FAILED_REQUEST_ID = "7f3a-91c2";
const unavailable = (route: Route) =>
  route.fulfill({
    status: 503,
    contentType: "application/problem+json",
    headers: { "X-Request-Id": FAILED_REQUEST_ID },
    body: JSON.stringify({
      type: "urn:tekpas:problem:internal",
      title: "Service unavailable",
      status: 503,
      requestId: FAILED_REQUEST_ID,
    }),
  });

/** List rows carry everything but the description (ProductListItem). */
function listItem(product: MockProduct) {
  const item: Partial<MockProduct> = { ...product };
  delete item.description;
  return item;
}

type StepStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";
type StepType = "FIBER" | "YARN" | "FABRIC" | "DYEING" | "SEWING";

/** ChainStepResponse; the supplier is one of designSuppliers(), FIBER records an origin instead. */
export interface MockStep {
  id: string;
  stepType: StepType;
  status: StepStatus;
  supplier: { id: string; name: string; city: string | null; type: string } | null;
  sortOrder: number;
  inputStepIds: string[];
  data: Record<string, unknown>;
  documentCount: number;
  submittedAt: string | null;
  updatedAt: string;
}

export interface MockBatch {
  id: string;
  batchNo: string;
  productId: string;
  productionOrderNo: string | null;
  status: "DRAFT" | "COLLECTING" | "READY" | "PUBLISHED";
  quantity: number;
  producedFrom: string | null;
  producedTo: string | null;
  /** Mock only: the chain (the API sends its summary with the batch, the steps from /chain). */
  steps: MockStep[];
  createdAt: string;
  updatedAt: string;
}

const STEP_ORDER: StepType[] = ["FIBER", "YARN", "FABRIC", "DYEING", "SEWING"];
const SUPPLIER_TYPE: Record<StepType, string> = {
  FIBER: "",
  YARN: "YARN",
  FABRIC: "FABRIC",
  DYEING: "DYEHOUSE",
  SEWING: "SEWING",
};

/** One step of mockChain: type, status, supplier name (FIBER: the fibre) and data. */
export type StepSpec = [StepType, StepStatus, string?, Record<string, unknown>?];

/**
 * A chain in the API's order; every step takes the steps of the previous type as inputs (as the design's two
 * yarns both feed the fabric).
 */
export function mockChain(batch: number, specs: StepSpec[]): MockStep[] {
  const suppliers = designSuppliers();
  const steps: MockStep[] = specs.map(([stepType, status, who, data = {}], i) => {
    const supplier = stepType === "FIBER" || !who ? undefined : suppliers.find((s) => s.name === who);
    return {
      id: `40000000-0000-4000-8000-0000000${String(batch).padStart(2, "0")}${String(i).padStart(3, "0")}`,
      stepType,
      status,
      supplier: supplier ? { id: supplier.id, name: supplier.name, city: supplier.city, type: SUPPLIER_TYPE[stepType] } : null,
      sortOrder: i,
      inputStepIds: [],
      data: stepType === "FIBER" && who ? { fiberType: who, ...data } : data,
      documentCount: 0,
      submittedAt: status === "PENDING" ? null : at(8, 20),
      updatedAt: at(8, 20),
    };
  });
  for (const step of steps) {
    const previous = STEP_ORDER[STEP_ORDER.indexOf(step.stepType) - 1];
    step.inputStepIds = steps.filter((s) => s.stepType === previous).map((s) => s.id);
  }
  return steps;
}

/** The default chain: five steps, nobody assigned. */
export const defaultChain = (batch: number) => mockChain(batch, STEP_ORDER.map((type): StepSpec => [type, "PENDING"]));

/** The chain of design v0.3 09 (KP-2026-0918-A); v0.3.1 29 rejects the second yarn (index 2). */
export function designChain(batch = 2): MockStep[] {
  return mockChain(batch, [
    ["FIBER", "APPROVED", "ORGANIC_COTTON", { originRegion: "Harran, Şanlıurfa", originCountry: "TR" }],
    ["YARN", "APPROVED", "Bursa İplik San.", { fiberComposition: [{ fiber: "COTTON", percent: 100 }] }],
    // The data of design 10 and v0.3.1 30.
    [
      "YARN",
      "SUBMITTED",
      "Maraş Penye İplik",
      {
        fiberComposition: [{ fiber: "COTTON", percent: 80 }, { fiber: "POLYESTER", percent: 20 }],
        originCountry: "TR",
        energySources: [{ source: "GRID", percent: 60 }, { source: "SOLAR", percent: 40 }],
        energyKwhPerKg: 3.4,
        deliveredKg: 640,
        yarnCount: "Ne 30/1",
        yarnProcess: "CARDED",
      },
    ],
    ["FABRIC", "SUBMITTED", "Denizli Örme Tekstil"],
    [
      "DYEING",
      "SUBMITTED",
      "Çınar Boya Apre",
      {
        dyeProcess: "REACTIVE",
        shade: "Ekru",
        chemicalStandards: ["ZDHC_MRSL", "OEKO_TEX_ECO_PASSPORT"],
        deliveredKg: 1150,
        energySources: [{ source: "NATURAL_GAS", percent: 80 }, { source: "SOLAR", percent: 20 }],
        waterLPerKg: 62,
      },
    ],
    ["SEWING", "PENDING"],
  ]);
}

/** Five steps with suppliers, statuses in chain order. */
const fiveSteps = (batch: number, statuses: StepStatus[], sewing = "Lale Konfeksiyon") =>
  mockChain(batch, [
    ["FIBER", statuses[0], "COTTON", { originRegion: "Söke, Aydın", originCountry: "TR" }],
    ["YARN", statuses[1], "Bursa İplik San.", { fiberComposition: [{ fiber: "COTTON", percent: 100 }] }],
    ["FABRIC", statuses[2], "Denizli Örme Tekstil"],
    ["DYEING", statuses[3], "Çınar Boya Apre"],
    ["SEWING", statuses[4], sewing],
  ]);

/** BatchResponse.chain: counts and the statuses in chain order (v0.3.1 22). */
export function chainSummary(steps: MockStep[]) {
  return {
    totalSteps: steps.length,
    approvedSteps: steps.filter((s) => s.status === "APPROVED").length,
    stepStatuses: steps.map((s) => s.status),
  };
}

/** The design's sample batches (v0.3.1 22: stages as there; 0918-A has the chain of 09, 0927-A none, 26). */
export function designBatches(): MockBatch[] {
  const b = (
    n: number,
    batchNo: string,
    product: number,
    quantity: number,
    order: string,
    status: MockBatch["status"],
    steps: MockStep[],
    updatedAt: string,
    produced: [string, string] | null = null,
  ): MockBatch => ({
    id: `30000000-0000-4000-8000-00000000000${n}`,
    batchNo,
    productId: `20000000-0000-4000-8000-00000000000${product}`,
    productionOrderNo: order,
    status,
    quantity,
    producedFrom: produced?.[0] ?? null,
    producedTo: produced?.[1] ?? null,
    steps,
    createdAt: at(7, 1),
    updatedAt,
  });
  const [A, S, P, R]: StepStatus[] = ["APPROVED", "SUBMITTED", "PENDING", "REJECTED"];
  return [
    b(1, "KP-2026-0927-A", 1, 1800, "ÜE-2026-0452", "DRAFT", [], at(9, 3, 10, 5), ["2026-09-29", "2026-10-17"]),
    b(2, "KP-2026-0918-A", 1, 2400, "ÜE-2026-0441", "COLLECTING", designChain(2), at(9, 3, 9, 32), ["2026-09-02", "2026-09-20"]),
    b(3, "KP-2026-0917-C", 2, 1150, "ÜE-2026-0437", "COLLECTING", fiveSteps(3, [A, A, A, S, P], "Gökçe Konfeksiyon"), at(9, 2, 16, 0)),
    b(4, "KP-2026-0912-B", 3, 3800, "ÜE-2026-0429", "PUBLISHED", fiveSteps(4, [A, A, A, A, A]), at(8, 12)),
    b(5, "KP-2026-0909-A", 6, 2000, "ÜE-2026-0421", "COLLECTING", fiveSteps(5, [A, A, R, P, P]), at(8, 9)),
    b(6, "KP-2026-0904-B", 4, 600, "ÜE-2026-0415", "READY", fiveSteps(6, [A, A, A, S, A]), at(8, 4)),
    b(7, "KP-2026-0828-A", 3, 4200, "ÜE-2026-0398", "PUBLISHED", fiveSteps(7, [A, A, A, A, A], "Yıldız Fason Dikim"), at(7, 28)),
  ];
}

export interface MockSupplier {
  id: string;
  name: string;
  type: "YARN" | "FABRIC" | "DYEHOUSE" | "SEWING" | "ACCESSORY";
  city: string;
  phone: string | null;
  batchCount: number;
  latestStepStatus: "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | null;
  latestStepAt: string | null;
  editable: boolean;
  linkedAt: string;
  /** Mock only: the design batches (by number) whose chain uses this supplier. */
  batchNos: string[];
}

/**
 * The design's suppliers (v0.3.1 27/28). Phone numbers are from the unassigned 0224 000 exchange, never the
 * design's sample numbers. "Ekin Aksesuar" has its own account (not editable).
 */
const LATEST_DAY: Record<number, number> = { 1: 16, 2: 16, 3: 15, 4: 19, 5: 8, 6: 14, 7: 2, 9: 10, 10: 1 };

export function designSuppliers(): MockSupplier[] {
  const s = (
    n: number,
    name: string,
    type: MockSupplier["type"],
    city: string,
    batchCount: number,
    latestStepStatus: MockSupplier["latestStepStatus"],
    batchNos: string[] = [],
    editable = true,
  ): MockSupplier => ({
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    name,
    type,
    city,
    phone: `+90224000${String(n).padStart(4, "0")}`,
    batchCount,
    latestStepStatus,
    // September, as in v0.3.1 25 ("Son durum · 14 Eyl").
    latestStepAt: latestStepStatus ? at(8, LATEST_DAY[n] ?? 1, 10) : null,
    editable,
    linkedAt: at(6, n),
    batchNos,
  });
  return [
    s(1, "Bursa İplik San.", "YARN", "Bursa", 9, "APPROVED", ["KP-2026-0918-A", "KP-2026-0917-C", "KP-2026-0912-B"]),
    s(2, "Maraş Penye İplik", "YARN", "Kahramanmaraş", 3, "SUBMITTED"),
    s(3, "Denizli Örme Tekstil", "FABRIC", "Denizli", 7, "SUBMITTED"),
    s(4, "Çınar Boya Apre", "DYEHOUSE", "Denizli", 5, "APPROVED"),
    s(5, "Gökçe Konfeksiyon", "SEWING", "İzmir", 4, "PENDING"),
    s(6, "Lale Konfeksiyon", "SEWING", "Bursa", 6, "APPROVED"),
    s(7, "Yıldız Fason Dikim", "SEWING", "Tekirdağ", 2, "SUBMITTED"),
    s(8, "Ege Fason Dikim", "SEWING", "Manisa", 0, null),
    s(9, "Ekin Aksesuar", "ACCESSORY", "İstanbul", 2, "REJECTED", [], false),
    s(10, "Uşak Kumaş Dokuma", "FABRIC", "Uşak", 1, "APPROVED"),
  ];
}

/** GET /batches/next-batch-no at NOW. */
export const NEXT_BATCH_NO = "KP-2026-1003-A";

interface CatalogOptions {
  products?: MockProduct[];
  batches?: MockBatch[];
  /** GTINs (14 digits) that belong to another company: a save answers 409 without naming it. */
  foreignGtins?: string[];
  /** Answer every list request with a 503 (and its request id). */
  failLists?: boolean;
  suppliers?: MockSupplier[];
}

/** Installs the mock; returns the live product array so tests can inspect what was saved. */
export async function mockCatalogApi(
  page: Page,
  {
    products = designProducts(),
    batches = designBatches(),
    foreignGtins = [],
    failLists = false,
    suppliers = designSuppliers(),
  }: CatalogOptions = {},
) {
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
      if (failLists) return unavailable(route);
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

  const batchResponse = (batch: MockBatch) => {
    const product = store.find((p) => p.id === batch.productId)!;
    const response: Partial<MockBatch> & { product: unknown; chain: unknown } = {
      ...batch,
      product: { id: product.id, name: product.name, gtin: product.gtin },
      chain: chainSummary(batch.steps),
    };
    delete response.productId;
    delete response.steps;
    return response;
  };
  const chainResponse = (batch: MockBatch) => ({
    batchId: batch.id,
    steps: batch.steps,
    summary: chainSummary(batch.steps),
    unassignedStepTypes: [...new Set(batch.steps.filter((s) => s.stepType !== "FIBER" && !s.supplier).map((s) => s.stepType))],
  });
  const notFound = (route: Route) => problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
  const idBefore = (route: Route, suffix: string) => {
    const path = new URL(route.request().url()).pathname;
    return path.slice(0, path.length - suffix.length).split("/").pop();
  };

  await page.route(/\/api\/v1\/batches\/[0-9a-f-]{36}$/, (route) => {
    const batch = batches.find((b) => b.id === idBefore(route, ""));
    if (!batch) return notFound(route);
    if (route.request().method() === "GET") return route.fulfill({ json: batchResponse(batch) });
    return route.fallback();
  });

  await page.route(/\/api\/v1\/batches\/[0-9a-f-]{36}\/chain$/, (route) => {
    const batch = batches.find((b) => b.id === idBefore(route, "/chain"));
    if (!batch) return notFound(route);
    if (route.request().method() === "GET") return route.fulfill({ json: chainResponse(batch) });
    if (route.request().method() === "POST") {
      if (batch.steps.length > 0) {
        return problem(route, 409, { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "CHAIN_EXISTS" });
      }
      batch.steps = defaultChain(90);
      return route.fulfill({ json: chainResponse(batch) });
    }
    return route.fallback();
  });

  // v0.3.1 25: assign a supplier of the network whose type fits the step.
  await page.route(/\/api\/v1\/steps\/[0-9a-f-]{36}$/, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const id = idBefore(route, "");
    const batch = batches.find((b) => b.steps.some((s) => s.id === id));
    const step = batch?.steps.find((s) => s.id === id);
    if (!batch || !step) return notFound(route);
    const { supplierId } = route.request().postDataJSON();
    const supplier = suppliers.find((x) => x.id === supplierId);
    if (!supplier) return notFound(route);
    if (supplier.type !== SUPPLIER_TYPE[step.stepType]) {
      return problem(route, 400, {
        type: "urn:tekpas:problem:validation",
        title: "Bad Request",
        errors: [{ field: "supplierId", code: "SupplierType", message: "The supplier's type does not fit the step" }],
      });
    }
    step.supplier = { id: supplier.id, name: supplier.name, city: supplier.city, type: supplier.type };
    supplier.batchCount += 1;
    return route.fulfill({ json: chainResponse(batch) });
  });

  await page.route(/\/api\/v1\/products\/[0-9a-f-]{36}\/chain-preview$/, (route) => {
    const id = idBefore(route, "/chain-preview");
    if (!store.some((p) => p.id === id)) return notFound(route);
    const last = batches
      .filter((b) => b.productId === id && b.steps.length > 0)
      .sort((a, z) => z.createdAt.localeCompare(a.createdAt) || z.batchNo.localeCompare(a.batchNo))[0];
    return route.fulfill({
      json: last ? { stepCount: last.steps.length, sourceBatchNo: last.batchNo } : { stepCount: 5, sourceBatchNo: null },
    });
  });

  await page.route(/\/api\/v1\/batches\/next-batch-no$/, (route) => route.fulfill({ json: { batchNo: NEXT_BATCH_NO } }));

  await page.route(/\/api\/v1\/batches\/status-counts$/, (route) => {
    if (failLists) return unavailable(route);
    const count = (status: MockBatch["status"]) => batches.filter((b) => b.status === status).length;
    return route.fulfill({
      json: {
        all: batches.length,
        DRAFT: count("DRAFT"),
        COLLECTING: count("COLLECTING"),
        READY: count("READY"),
        PUBLISHED: count("PUBLISHED"),
      },
    });
  });

  await page.route(/\/api\/v1\/batches(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (failLists) return unavailable(route);
      const url = new URL(request.url());
      const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr");
      const status = url.searchParams.get("status");
      const productId = url.searchParams.get("productId");
      const supplierId = url.searchParams.get("supplierId");
      const supplier = supplierId ? suppliers.find((x) => x.id === supplierId) : undefined;
      if (supplierId && !supplier) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
      const matches = batches
        .filter((b) => !supplier || supplier.batchNos.includes(b.batchNo))
        .filter((b) => !status || b.status === status)
        .filter((b) => !productId || b.productId === productId)
        .filter((b) => !q || [b.batchNo, b.productionOrderNo ?? ""].some((v) => v.toLocaleLowerCase("tr").includes(q)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return route.fulfill({
        json: { content: matches.map(batchResponse), page: 0, size: 100, totalElements: matches.length, totalPages: 1 },
      });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      if (!store.some((p) => p.id === body.productId)) {
        return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
      }
      const batchNo = body.batchNo || NEXT_BATCH_NO;
      if (batches.some((b) => b.productId === body.productId && b.batchNo === batchNo)) {
        return problem(route, 409, {
          type: "urn:tekpas:problem:conflict",
          title: "Conflict",
          errors: [{ field: "batchNo", code: "Unique", message: "This product already has a batch with this number" }],
        });
      }
      const now = new Date().toISOString();
      const created: MockBatch = {
        id: `30000000-0000-4000-8000-${String(batches.length + 100).padStart(12, "0")}`,
        batchNo,
        productId: body.productId,
        productionOrderNo: body.productionOrderNo ?? null,
        status: "DRAFT",
        quantity: body.quantity,
        producedFrom: body.producedFrom ?? null,
        producedTo: body.producedTo ?? null,
        steps: defaultChain(91),
        createdAt: now,
        updatedAt: now,
      };
      batches.unshift(created);
      store.find((p) => p.id === body.productId)!.batchCount += 1;
      return route.fulfill({ status: 201, json: batchResponse(created) });
    }
    return route.fallback();
  });

  /** The API's shape: the mock-only batchNos stay out. */
  const supplierResponse = (supplier: MockSupplier) => {
    const response: Partial<MockSupplier> = { ...supplier };
    delete response.batchNos;
    return response;
  };

  await page.route(/\/api\/v1\/suppliers(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (failLists) return unavailable(route);
      const url = new URL(request.url());
      const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr");
      const type = url.searchParams.get("type");
      const matches = suppliers
        .filter((x) => !type || x.type === type)
        .filter((x) => !q || [x.name, x.city].some((v) => v.toLocaleLowerCase("tr").includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name, "tr"));
      return route.fulfill({
        json: { content: matches.map(supplierResponse), page: 0, size: 100, totalElements: matches.length, totalPages: 1 },
      });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      const created: MockSupplier = {
        id: `00000000-0000-4000-8000-0000000002${String(suppliers.length).padStart(2, "0")}`,
        name: body.name,
        type: body.type,
        city: body.city,
        phone: body.phone ?? null,
        batchCount: 0,
        latestStepStatus: null,
        latestStepAt: null,
        editable: true,
        linkedAt: new Date().toISOString(),
        batchNos: [],
      };
      suppliers.push(created);
      return route.fulfill({ status: 201, json: supplierResponse(created) });
    }
    return route.fallback();
  });

  await page.route(/\/api\/v1\/suppliers\/[0-9a-f-]+$/, async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/").pop();
    const supplier = suppliers.find((x) => x.id === id);
    if (!supplier) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
    if (request.method() === "GET") return route.fulfill({ json: supplierResponse(supplier) });
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      const details = ["name", "type", "city"].some((k) => body[k] !== undefined);
      if (details && !supplier.editable) {
        return problem(route, 409, { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "SUPPLIER_NOT_EDITABLE" });
      }
      if (body.type !== undefined && body.type !== supplier.type && supplier.batchCount > 0) {
        return problem(route, 409, { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "SUPPLIER_TYPE_IN_USE" });
      }
      Object.assign(supplier, body);
      return route.fulfill({ json: supplierResponse(supplier) });
    }
    if (request.method() === "DELETE") {
      if (supplier.batchCount > 0) {
        return problem(route, 409, { type: "urn:tekpas:problem:conflict", title: "Conflict", reason: "SUPPLIER_IN_USE" });
      }
      suppliers.splice(suppliers.indexOf(supplier), 1);
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });

  return store;
}
