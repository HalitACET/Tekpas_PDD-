import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { AuthGate } from "./auth-gate";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/documents",
}));

// A small stand-in for the session store: the gate only reads its state and calls restoreSession.
type State = { status: "unknown" } | { status: "anonymous" } | { status: "authenticated"; user: object };
const store = vi.hoisted(() => {
  let state: State = { status: "unknown" };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: State) {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = { status: "unknown" };
      listeners.clear();
    },
  };
});
const restoreSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getSessionState: store.get,
  subscribeSession: store.subscribe,
  restoreSession: () => restoreSession(),
  setSessionLostHandler: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  store.reset();
  restoreSession.mockResolvedValue(undefined);
});

describe("AuthGate", () => {
  it("restores the session and shows no content while it is unknown", async () => {
    renderWithIntl(
      <AuthGate>
        <p>secret content</p>
      </AuthGate>,
    );

    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Yükleniyor…");
  });

  it("renders the content once authenticated", async () => {
    renderWithIntl(
      <AuthGate>
        <p>secret content</p>
      </AuthGate>,
    );

    act(() => store.set({ status: "authenticated", user: {} }));

    expect(await screen.findByText("secret content")).toBeInTheDocument();
  });

  it("sends guests to /login with the page they wanted", async () => {
    renderWithIntl(
      <AuthGate>
        <p>secret content</p>
      </AuthGate>,
    );

    act(() => store.set({ status: "anonymous" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fdocuments"));
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });
});
