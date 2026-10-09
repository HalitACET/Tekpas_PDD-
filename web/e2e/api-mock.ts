import type { Page, Route } from "@playwright/test";

/** Demo user as the design shows it (Karaca Tekstil A.Ş., Elif Yılmaz, Yönetici). */
export const DESIGN_USER = {
  id: "10000000-0000-0000-0000-000000000009",
  email: "elif@karacatekstil.com.tr",
  fullName: "Elif Yılmaz",
  role: "ADMIN",
  locale: "tr",
  company: { id: "00000000-0000-0000-0000-000000000009", name: "Karaca Tekstil A.Ş.", type: "MANUFACTURER" },
};

const problem = (type: string, title: string, status: number) => ({
  status,
  contentType: "application/problem+json",
  body: JSON.stringify({ type: `urn:tekpas:problem:${type}`, title, status }),
});

interface MockOptions {
  /** Is there a valid refresh cookie? */
  signedIn: boolean;
  /** Role of the signed-in user (default: the design's ADMIN). */
  role?: string;
  /** How /auth/login answers. */
  login?: "ok" | "invalid" | "hang";
}

/** Browser-side stand-in for the backend's /api/v1/auth endpoints. */
export async function mockAuthApi(page: Page, { signedIn, login = "ok", role }: MockOptions) {
  let session = signedIn;
  // The server is awake (lib/server-wake.ts probes this first); wake.spec.ts overrides it.
  await page.route("**/api/health", (route) => route.fulfill({ json: { status: "UP" } }));
  const user = role ? { ...DESIGN_USER, role } : DESIGN_USER;
  const tokens = { access: "access-1" };

  await page.route("**/api/v1/auth/refresh", (route) =>
    session
      ? route.fulfill({ json: { accessToken: tokens.access, tokenType: "Bearer", expiresIn: 900 } })
      : route.fulfill(problem("invalid-refresh-token", "Invalid refresh token", 401)),
  );
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.request().headers().authorization === `Bearer ${tokens.access}`
      ? route.fulfill({ json: user })
      : route.fulfill(problem("unauthorized", "Unauthorized", 401)),
  );
  await page.route("**/api/v1/auth/login", async (route) => {
    if (login === "hang") return; // never answers: the button stays in its loading state
    if (login === "invalid") return route.fulfill(problem("invalid-credentials", "Invalid credentials", 401));
    session = true;
    return route.fulfill({
      json: { accessToken: tokens.access, tokenType: "Bearer", expiresIn: 900, user },
    });
  });
  await page.route("**/api/v1/auth/logout", (route) => {
    session = false;
    return route.fulfill({ status: 204 });
  });
}
