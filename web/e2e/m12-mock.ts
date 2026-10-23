import type { Page } from "@playwright/test";

/** The design's team at Karaca Tekstil (v1.2 160): the owner, the signed-in admin, an editor, an invited and a former colleague. */
export const M12_NOW = new Date("2026-10-23T14:50:00+03:00");
const day = 86_400_000;
const user = <T extends object>(id: number, over: T) => ({
  id: `10000000-0000-0000-0000-00000000000${id}`,
  lastLoginAt: null,
  invitationExpiresAt: null,
  inactiveSince: null,
  you: false,
  status: "ACTIVE",
  ...over,
});

export const TEAM = [
  user(1, { fullName: "Selim Karaca", email: "selim@karacatekstil.com.tr", role: "OWNER", you: true }),
  user(9, { fullName: "Elif Yılmaz", email: "elif@karacatekstil.com.tr", role: "ADMIN" }),
  user(2, { fullName: "Zeynep Arslan", email: "zeynep@karacatekstil.com.tr", role: "EDITOR" }),
  user(3, { fullName: "Mert Kaya", email: "mert@karacatekstil.com.tr", role: "VIEWER", status: "INVITED", invitationExpiresAt: new Date(M12_NOW.getTime() + 5.2 * day).toISOString() }),
  user(4, { fullName: "Burak Şen", email: "burak@karacatekstil.com.tr", role: "EDITOR", status: "INVITATION_EXPIRED", invitationExpiresAt: new Date(M12_NOW.getTime() - 3 * day).toISOString() }),
  user(5, { fullName: "Can Öztürk", email: "can@karacatekstil.com.tr", role: "EDITOR", status: "INACTIVE", inactiveSince: "2026-10-12T09:00:00+03:00" }),
];

const at = (offsetMinutes: number) => new Date(M12_NOW.getTime() - offsetMinutes * 60_000).toISOString();
let id = 0;
const entry = (minutes: number, userName: string | null, entityType: string, action: string, label: string, details: object = {}) => ({
  id: ++id,
  at: at(minutes),
  userId: userName ? TEAM.find((u) => u.fullName === userName)?.id : null,
  userName,
  entityType,
  entityId: "50000000-0000-0000-0000-000000000001",
  action,
  label,
  batchId: null,
  details,
});

export const AUDIT = [
  entry(8, "Selim Karaca", "PASSPORT", "PUBLISH", "KT-2026-1023-A", { version: 2 }),
  entry(25, "Elif Yılmaz", "TRANSLATION", "APPROVE", "KT-2026-1023-A", { languages: ["EN", "DE"], entries: 6 }),
  entry(70, "Elif Yılmaz", "STEP", "APPROVE", "KT-2026-1023-A", { stepType: "DYEING" }),
  entry(95, "Zeynep Arslan", "DOCUMENT", "VERIFY", "Demirtaş Boya", { docType: "OEKO_TEX" }),
  entry(160, "Selim Karaca", "USER", "DEACTIVATE", "Can Öztürk", { active: [true, false] }),
  entry(1_000, "Zeynep Arslan", "BATCH", "CREATE", "KT-2026-1023-A"),
  entry(1_080, "Elif Yılmaz", "STEP", "REJECT", "KT-2026-1019-B", { stepType: "FABRIC", fields: ["gsm", "fabricType"] }),
  entry(1_150, "Selim Karaca", "USER", "ROLE", "Zeynep Arslan", { role: ["VIEWER", "EDITOR"] }),
  entry(1_210, "Zeynep Arslan", "IMPORT", "IMPORT", "urunler_ekim.xlsx", { created: 45, failed: 5 }),
  entry(2_700, "Elif Yılmaz", "SUPPLIER", "CREATE", "Ege İplik"),
  entry(2_750, "Selim Karaca", "USER", "INVITE", "Mert Kaya", { role: "VIEWER" }),
];

export const INVITATION = {
  companyName: "Karaca Tekstil A.Ş.",
  email: "zeynep@karacatekstil.com.tr",
  expiresAt: "2026-10-30T09:00:00+03:00",
  fullName: "Zeynep Arslan",
  invitedByName: "Selim Karaca",
  role: "EDITOR",
};

/** The users, audit and public invitation endpoints of M12, answered in the browser. */
export async function mockTeamApi(page: Page) {
  await page.route(/\/api\/v1\/users$/, (route) => route.fulfill({ json: TEAM }));
  await page.route(/\/api\/v1\/users\/invitations$/, async (route) => {
    const body = route.request().postDataJSON() as { fullName: string; email: string; role: string };
    return route.fulfill({
      status: 201,
      json: {
        token: "Kp7xR2vQ9mT4wZ8nB3cY6hJ1",
        expiresAt: new Date(M12_NOW.getTime() + 7 * day).toISOString(),
        user: user(7, { ...body, status: "INVITED", invitationExpiresAt: new Date(M12_NOW.getTime() + 7 * day).toISOString() }),
      },
    });
  });
  await page.route(/\/api\/v1\/audit(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const types = url.searchParams.getAll("entityType");
    const entries = types.length ? AUDIT.filter((e) => types.includes(e.entityType)) : AUDIT;
    return route.fulfill({ json: { entries, total: types.length ? entries.length : 1_248, page: 0, size: 25 } });
  });
}

/** GET and POST /public/invitation for the token in the link; any other token is unknown. */
export async function mockInvitationApi(page: Page, answer: "ok" | "expired" | "used" = "ok") {
  await page.route(/\/api\/v1\/public\/invitation$/, (route) => {
    if (route.request().headers()["x-invitation-token"] !== "tok-zeynep") {
      return route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ type: "urn:tekpas:problem:link-invalid", status: 404, title: "Not found", reason: "INVITATION_INVALID" }) });
    }
    if (answer !== "ok") {
      const reason = answer === "expired" ? "INVITATION_EXPIRED" : "INVITATION_USED";
      const extra = answer === "expired" ? { companyName: "Karaca Tekstil", invitedByName: "Selim Karaca" } : {};
      return route.fulfill({ status: 410, contentType: "application/problem+json", body: JSON.stringify({ type: "urn:tekpas:problem:link-gone", status: 410, title: "Gone", reason, ...extra }) });
    }
    return route.fulfill({ json: INVITATION });
  });
  await page.route(/\/api\/v1\/public\/invitation\/accept$/, (route) => route.fulfill({ status: 204 }));
}
