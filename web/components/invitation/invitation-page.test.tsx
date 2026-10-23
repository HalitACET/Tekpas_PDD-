import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/request";
import { renderWithIntl } from "@/test/render";

const state = vi.hoisted(() => ({
  invitation: { data: undefined as unknown, isPending: true, isError: false, error: null as unknown },
  accept: { mutate: vi.fn(), isPending: false, error: null as unknown },
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api/users", () => ({
  usePublicInvitation: () => state.invitation,
  useAcceptInvitation: () => state.accept,
}));

import { InvitationPage } from "./invitation-page";

const view = {
  companyName: "Karaca Tekstil A.Ş.",
  email: "zeynep@karacatekstil.example",
  expiresAt: "2026-10-30T09:00:00Z",
  fullName: "Zeynep Arslan",
  invitedByName: "Selim Karaca",
  role: "EDITOR",
};

const closed = (status: number, problem: Record<string, unknown>) =>
  new ApiError(status, { status, title: "Gone", type: "urn:tekpas:problem:link-gone", ...problem } as never);

beforeEach(() => {
  window.location.hash = "#tok-123";
  state.invitation = { data: view, isPending: false, isError: false, error: null };
  state.accept = { mutate: vi.fn(), isPending: false, error: null };
});

describe("InvitationPage (design v1.2 170–174)", () => {
  it("says who invites and as what, then checks the password before sending it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<InvitationPage />);

    expect(screen.getByRole("heading", { name: "Hoş geldiniz, Zeynep" })).toBeInTheDocument();
    expect(screen.getAllByText("Karaca Tekstil A.Ş.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Editör").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30 Ekim 2026 tarihinde kapanır/)).toHaveLength(2);

    const [password, again] = [screen.getByLabelText(/^Şifre/, { selector: "input[aria-describedby]" }), screen.getByLabelText("Şifre tekrar")];
    await user.type(password, "kozapass");
    await user.click(screen.getByRole("button", { name: "Şifremi belirle" }));
    expect(screen.getByText("En az 10 karakter olmalı · şu an 8")).toBeInTheDocument();
    expect(state.accept.mutate).not.toHaveBeenCalled();

    await user.type(password, "-2026");
    await user.type(again, "kozapass-206");
    await user.click(screen.getByRole("button", { name: "Şifremi belirle" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Şifreler eşleşmiyor.");
    expect(state.accept.mutate).not.toHaveBeenCalled();

    await user.clear(again);
    await user.type(again, "kozapass-2026");
    await user.click(screen.getByRole("button", { name: "Göster" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Şifremi belirle" }));
    expect(state.accept.mutate).toHaveBeenCalledWith("kozapass-2026", expect.anything());
  });

  it("opens the login with the e-mail filled in once the password is set", async () => {
    const user = userEvent.setup();
    state.accept.mutate = vi.fn((_: string, options: { onSuccess: () => void }) => options.onSuccess());
    renderWithIntl(<InvitationPage />);

    await user.type(screen.getByLabelText(/^Şifre/, { selector: "input[aria-describedby]" }), "kozapass-2026");
    await user.type(screen.getByLabelText("Şifre tekrar"), "kozapass-2026");
    await user.click(screen.getByRole("button", { name: "Şifremi belirle" }));

    expect(screen.getByRole("heading", { name: "Hesabınız hazır" })).toBeInTheDocument();
    expect(screen.getByText(/Karaca Tekstil A.Ş. panelinde Editör olarak/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panele giriş yap" })).toHaveAttribute(
      "href",
      "/login?email=zeynep%40karacatekstil.example",
    );
  });

  it("shows the server's failure under the form and keeps what was typed", async () => {
    state.accept.error = new ApiError(503, undefined);
    renderWithIntl(<InvitationPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Şifre kaydedilemedi");
    expect(screen.getByRole("alert")).toHaveTextContent("Hata: 503");
  });

  it("names whom to ask when the invitation has expired", () => {
    state.invitation = {
      data: undefined,
      isPending: false,
      isError: true,
      error: closed(410, { reason: "INVITATION_EXPIRED", companyName: "Karaca Tekstil", invitedByName: "Selim Karaca" }),
    };
    renderWithIntl(<InvitationPage />);
    expect(screen.getByRole("heading", { name: "Bu davetin süresi doldu" })).toBeInTheDocument();
    expect(screen.getByText(/Selim Karaca kişisinden yeni bir bağlantı isteyin/)).toBeInTheDocument();
    expect(screen.getByText("Selim Karaca · Karaca Tekstil")).toBeInTheDocument();
    expect(screen.getByText("Hata: INVITATION_EXPIRED")).toBeInTheDocument();
  });

  it("sends a used invitation to the login", () => {
    state.invitation = { data: undefined, isPending: false, isError: true, error: closed(410, { reason: "INVITATION_USED" }) };
    renderWithIntl(<InvitationPage />);
    expect(screen.getByRole("heading", { name: "Bu davet zaten kullanıldı" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giriş yap" })).toHaveAttribute("href", "/login");
  });

  it("calls a link without a token, or an unknown one, invalid", () => {
    window.location.hash = "";
    state.invitation = { data: undefined, isPending: true, isError: false, error: null };
    renderWithIntl(<InvitationPage />);
    expect(screen.getByRole("heading", { name: "Bağlantı geçersiz" })).toBeInTheDocument();
    expect(screen.getByText("Hata: INVITATION_INVALID")).toBeInTheDocument();
  });

  it("shows a skeleton while the invitation is checked", () => {
    state.invitation = { data: undefined, isPending: true, isError: false, error: null };
    renderWithIntl(<InvitationPage />);
    expect(screen.getByText("Davet kontrol ediliyor…")).toBeInTheDocument();
  });
});
