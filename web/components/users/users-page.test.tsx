import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserResponse } from "@/lib/api/users";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  role: "OWNER" as string,
  users: { data: [] as unknown[], isPending: false, isError: false, isSuccess: true, error: null, refetch: () => {} },
  me: { data: { ownerName: "Selim Karaca" } as unknown },
  invite: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown },
  update: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown },
  renew: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/lib/auth/use-session", () => ({
  useSession: () => ({ status: "authenticated", user: { role: state.role, company: { name: "Karaca Tekstil A.Ş." } } }),
}));
vi.mock("@/lib/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/users")>()),
  useUsers: () => state.users,
  useMe: () => state.me,
  useInviteUser: () => state.invite,
  useUpdateUser: () => state.update,
  useRenewInvitation: () => state.renew,
}));

import { UsersPage } from "./users-page";

const person = (over: Partial<UserResponse>): UserResponse => ({
  id: over.email ?? "u",
  email: "x@karaca.example",
  fullName: "X",
  role: "EDITOR",
  status: "ACTIVE",
  lastLoginAt: null,
  invitationExpiresAt: null,
  inactiveSince: null,
  you: false,
  ...over,
});

const team = [
  person({ id: "1", fullName: "Selim Karaca", email: "selim@karaca.example", role: "OWNER", you: true }),
  person({ id: "2", fullName: "Zeynep Arslan", email: "zeynep@karaca.example", role: "EDITOR" }),
  person({ id: "3", fullName: "Can Öztürk", email: "can@karaca.example", role: "VIEWER", status: "INACTIVE", inactiveSince: "2026-10-12T08:00:00Z" }),
  person({ id: "4", fullName: "Elif Yılmaz", email: "elif@karaca.example", role: "ADMIN", status: "INVITED", invitationExpiresAt: new Date(Date.now() + 5.5 * 86_400_000).toISOString() }),
];

beforeEach(() => {
  state.role = "OWNER";
  state.users = { data: team, isPending: false, isError: false, isSuccess: true, error: null, refetch: () => {} };
  state.me = { data: { ownerName: "Selim Karaca" } };
  state.invite = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  state.update = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  state.renew = { mutate: vi.fn(), isPending: false };
});

const rowOf = (name: string) => screen.getByText(name).closest('[role="row"]') as HTMLElement;

describe("UsersPage (design v1.2 160–169)", () => {
  it("lists the team with role, status and what the status means, counted per tab", async () => {
    const user = userEvent.setup();
    renderWithIntl(<UsersPage />);

    expect(screen.getByRole("tab", { name: /Tümü\s*4/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Davet bekleyen\s*1/ })).toBeInTheDocument();
    expect(within(rowOf("Selim Karaca")).getByText("Siz")).toBeInTheDocument();
    expect(within(rowOf("Can Öztürk")).getByText("Pasif")).toBeInTheDocument();
    expect(within(rowOf("Can Öztürk")).getByText("12 Eki 2026 tarihinden beri")).toBeInTheDocument();
    expect(within(rowOf("Elif Yılmaz")).getByText("7 gün içinde · 6 gün kaldı")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Pasif/ }));
    expect(screen.queryByText("Zeynep Arslan")).not.toBeInTheDocument();
    expect(screen.getByText("Can Öztürk")).toBeInTheDocument();
  });

  it("lets the owner change others but not themselves", async () => {
    const user = userEvent.setup();
    renderWithIntl(<UsersPage />);

    expect(within(rowOf("Selim Karaca")).getByRole("button", { name: "Kullanıcı işlemleri" })).toHaveAttribute("aria-disabled", "true");

    await user.click(within(rowOf("Zeynep Arslan")).getByRole("button", { name: "Kullanıcı işlemleri" }));
    await user.click(await screen.findByRole("menuitem", { name: "Pasifleştir" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Zeynep Arslan pasifleştirilsin mi?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Pasifleştir" }));
    expect(state.update.mutate).toHaveBeenCalledWith({ id: "2", active: false }, expect.anything());
  });

  it("invites a person and shows the link once", async () => {
    const user = userEvent.setup();
    state.invite.mutate = vi.fn((_: unknown, options: { onSuccess: (i: unknown) => void }) =>
      options.onSuccess({
        token: "tok-abcdef123456",
        expiresAt: "2026-10-30T09:00:00Z",
        user: person({ fullName: "Ayşe Demir", email: "ayse@karaca.example", status: "INVITED" }),
      }),
    );
    renderWithIntl(<UsersPage />);

    await user.click(screen.getByRole("button", { name: "Kişi davet et" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Davet bağlantısı oluştur" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Ad soyad"), "Ayşe Demir");
    await user.type(within(dialog).getByLabelText(/^E-posta/), "ayse@karaca.example");
    await user.click(within(dialog).getByRole("radio", { name: /Görüntüleyici/ }));
    await user.click(within(dialog).getByRole("button", { name: "Davet bağlantısı oluştur" }));

    expect(state.invite.mutate).toHaveBeenCalledWith(
      { fullName: "Ayşe Demir", email: "ayse@karaca.example", role: "VIEWER" },
      expect.anything(),
    );
    const linkDialog = await screen.findByRole("dialog", { name: /Davet bağlantısı hazır/ });
    expect(within(linkDialog).getByTitle(/\/davet#tok-abcdef123456$/)).toHaveTextContent(/\/davet#tok-…3456$/);
    expect(within(linkDialog).getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toContain(encodeURIComponent("/davet#tok-abcdef123456"));
  });

  it("shows an admin the team without the owner's actions", () => {
    state.role = "ADMIN";
    renderWithIntl(<UsersPage />);
    expect(screen.getByText(/Davet, rol ve pasifleştirme yalnızca firma sahibinde/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kişi davet et" })).toHaveAttribute("aria-disabled", "true");
    expect(within(rowOf("Zeynep Arslan")).getByRole("button", { name: "Kullanıcı işlemleri" })).toHaveAttribute("aria-disabled", "true");
  });

  it("tells an editor whom to ask", () => {
    state.role = "EDITOR";
    renderWithIntl(<UsersPage />);
    expect(screen.getByText("Kullanıcıları sahip ve yöneticiler görür")).toBeInTheDocument();
    expect(screen.getByText("Rolünüz: Editör. Erişim için firma sahibi Selim Karaca ile görüşün.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
