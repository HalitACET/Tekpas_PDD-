import type { Page } from "@playwright/test";

/*
 * The supplier's link page (design v0.4 39–45) talks to GET /public/request and POST /public/request/submit
 * with the token in the X-Request-Token header, and to nothing else (no session, no refresh).
 */

/** The page's clock: ten days into October, as in the design (deadline 17 October, "7 gün kaldı"). */
export const SUPPLIER_NOW = new Date(2026, 9, 10, 14, 30);
export const TOKEN = "Vq3xT9kLm2PbH7sYdE4wRz1NfJc6UaGoKi0XtBe8MhS";

type StepType = "YARN" | "FABRIC" | "DYEING" | "SEWING";

export function publicView(stepType: StepType, extra: Record<string, unknown> = {}) {
  return {
    code: "KP-R-7HQ2",
    manufacturerName: "Karaca Tekstil A.Ş.",
    requesterName: "Elif Yılmaz",
    productName: "Organik pamuk tişört, ekru",
    batchNo: "KP-2026-0918-A",
    stepType,
    expiresAt: new Date(2026, 9, 17, 14, 30).toISOString(),
    data: {},
    ...extra,
  };
}

/** A correction request (design 45): the previous yarn data and the reason, the fibre composition marked. */
export function correctionView() {
  return publicView("YARN", {
    data: {
      fiberComposition: [
        { fiber: "COTTON", percent: 80 },
        { fiber: "POLYESTER", percent: 20 },
      ],
      originCountry: "TR",
      energySources: [
        { source: "GRID", percent: 60 },
        { source: "SOLAR", percent: 40 },
      ],
      energyKwhPerKg: 3.4,
      deliveredKg: 640,
      yarnCount: "Ne 30/1",
      yarnProcess: "CARDED",
    },
    rejection: {
      reason:
        "Teknik föyde lif oranı %80 pamuk · %20 polyester görünüyor; etiket beyanımız %95 pamuk · %5 elastan. Teslim ettiğiniz ipliğin lif oranını kontrol edip doğru değeri girer misiniz?",
      fields: ["fiberComposition"],
      at: new Date(2026, 9, 8, 15, 12).toISOString(),
      byName: "Elif Yılmaz",
    },
  });
}

export const LINK = {
  manufacturerName: "Karaca Tekstil A.Ş.",
  requesterName: "Elif Yılmaz",
  stepType: "YARN",
  expiresAt: new Date(2026, 9, 17, 14, 30).toISOString(),
};

export interface Closed {
  status: 404 | 410;
  reason: "LINK_INVALID" | "LINK_EXPIRED" | "LINK_REVOKED" | "ALREADY_SUBMITTED";
  link?: Record<string, unknown>;
}

export interface PublicMock {
  /** How often the link was opened (GET). */
  opens: number;
  tokens: (string | null)[];
  urls: string[];
  submits: { token: string | null; body: unknown }[];
}

/**
 * Answers the public API. `view` opens; `closed` answers 404 or 410 instead. A submit answers like the API does,
 * or with `submitProblem` (status and body of a problem).
 */
export async function mockPublicRequest(
  page: Page,
  { view, closed, submitProblem }: { view?: object; closed?: Closed; submitProblem?: { status: number; body: object } },
): Promise<PublicMock> {
  const state: PublicMock = { opens: 0, tokens: [], urls: [], submits: [] };
  await page.route("**/api/health", (route) => route.fulfill({ json: { status: "UP" } }));
  await page.route(/\/api\/v1\/public\/request$/, (route) => {
    state.opens++;
    state.tokens.push(route.request().headers()["x-request-token"] ?? null);
    state.urls.push(route.request().url());
    if (closed) {
      return route.fulfill({
        status: closed.status,
        contentType: "application/problem+json",
        json: {
          type: closed.status === 404 ? "urn:tekpas:problem:link-invalid" : "urn:tekpas:problem:link-gone",
          title: closed.status === 404 ? "Not Found" : "Gone",
          status: closed.status,
          reason: closed.reason,
          ...(closed.link ? { link: closed.link } : {}),
        },
      });
    }
    return route.fulfill({ json: view });
  });
  await page.route(/\/api\/v1\/public\/request\/submit$/, (route) => {
    state.submits.push({ token: route.request().headers()["x-request-token"] ?? null, body: route.request().postDataJSON() });
    if (submitProblem) {
      return route.fulfill({ status: submitProblem.status, contentType: "application/problem+json", json: submitProblem.body });
    }
    return route.fulfill({
      json: { code: "KP-R-7HQ2", submittedAt: new Date(2026, 9, 10, 14, 32).toISOString(), manufacturerName: "Karaca Tekstil A.Ş." },
    });
  });
  return state;
}
