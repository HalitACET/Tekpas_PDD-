import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configure, render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import i18n from "@/lib/i18n";
import type { SessionState, SessionUser } from "@/lib/session";

// A shared CI runner renders a file's first screen slowly (modules load cold, the web tests run beside): findBy and
// waitFor wait up to 5 s, a test up to 20 s (package.json).
configure({ asyncUtilTimeout: 5000 });

/** The signed-in person a screen test sees; set it before rendering. */
export const testSession: { state: SessionState } = { state: { status: "anonymous" } };

export function signedInAs(role: SessionUser["role"]) {
  testSession.state = {
    status: "authenticated",
    user: {
      id: "u1",
      email: "ayse@demo.test",
      fullName: "Ayşe Demir",
      locale: "tr",
      role,
      company: { id: "c1", name: "Demo Tekstil", type: "MANUFACTURER" },
    },
  };
}

type Answer = { status?: number; body: unknown } | "offline";
let routes: { method: string; path: RegExp; answer: () => Answer }[] = [];
export const calls: { method: string; path: string; body?: unknown }[] = [];

/** Answers the API client's requests by method and path; anything not routed is a lost connection. */
export function route(method: string, path: RegExp, answer: Answer | (() => Answer)) {
  routes.push({ method, path, answer: typeof answer === "function" ? answer : () => answer });
}

export function resetApi() {
  routes = [];
  calls.length = 0;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const { pathname } = new URL(request.url);
    const text = request.method === "GET" ? undefined : await request.text();
    calls.push({ method: request.method, path: pathname, body: text ? JSON.parse(text) : undefined });
    const match = routes.find((r) => r.method === request.method && r.path.test(pathname));
    const answer = match?.answer();
    if (!answer || answer === "offline") throw new TypeError("Network request failed");
    const status = answer.status ?? 200;
    // 204 and the like have no body at all.
    if (status === 204 || status === 205 || status === 304) return new Response(null, { status });
    return new Response(JSON.stringify(answer.body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

/** A screen with a fresh query cache (no retries, so an error shows at once), in Turkish. */
export function renderScreen(ui: ReactElement) {
  void i18n.changeLanguage("tr");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: 0, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
