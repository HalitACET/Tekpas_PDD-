import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render";
import { LoginForm } from "./login-form";

const router = { replace: vi.fn(), refresh: vi.fn() };
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => search,
}));

const login = vi.fn();
const restoreSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  login: (...args: unknown[]) => login(...args),
  restoreSession: () => restoreSession(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  restoreSession.mockResolvedValue({ status: "anonymous" });
});

async function fillAndSubmit(email = "elif@karacatekstil.com.tr", password = "sifre") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("E-posta"), email);
  await user.type(screen.getByLabelText("Şifre"), password);
  await user.click(screen.getByRole("button", { name: "Giriş yap" }));
  return user;
}

describe("LoginForm", () => {
  it("labels every field and checks 'remember me' by default", () => {
    renderWithIntl(<LoginForm />);

    expect(screen.getByRole("heading", { level: 1, name: "Giriş yap" })).toBeInTheDocument();
    expect(screen.getByLabelText("E-posta")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Şifre")).toHaveAttribute("type", "password");
    expect(screen.getByRole("checkbox", { name: "Beni hatırla" })).toBeChecked();
  });

  it("shows one generic message for wrong credentials and marks the fields invalid", async () => {
    login.mockResolvedValue("invalid");
    renderWithIntl(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("E-posta veya şifre hatalı.");
    expect(screen.getByLabelText("E-posta")).toHaveAttribute("aria-invalid", "true");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("tells the user when the server cannot be reached", async () => {
    login.mockResolvedValue("unavailable");
    renderWithIntl(<LoginForm />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sunucuya şu an ulaşılamıyor");
  });

  it("shows the loading state and blocks double submits", async () => {
    let finish: (value: string) => void = () => {};
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderWithIntl(<LoginForm />);

    const user = await fillAndSubmit();
    const button = screen.getByRole("button", { name: "Giriş yapılıyor…" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(login).toHaveBeenCalledTimes(1);

    finish("ok");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/batches"));
  });

  it("sends the trimmed e-mail and the remember-me choice, then goes to ?next", async () => {
    search = new URLSearchParams("next=/products");
    login.mockResolvedValue("ok");
    renderWithIntl(<LoginForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: "Beni hatırla" }));
    await fillAndSubmit("  elif@karacatekstil.com.tr ", "sifre");

    expect(login).toHaveBeenCalledWith("elif@karacatekstil.com.tr", "sifre", false);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/products"));
  });

  it("ignores an external ?next target", async () => {
    search = new URLSearchParams("next=https://evil.example");
    login.mockResolvedValue("ok");
    renderWithIntl(<LoginForm />);

    await fillAndSubmit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/batches"));
  });

  it("toggles password visibility with an accessible button", async () => {
    renderWithIntl(<LoginForm />);
    const user = userEvent.setup();
    const password = screen.getByLabelText("Şifre");

    await user.click(screen.getByRole("button", { name: "Şifreyi göster" }));
    expect(password).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Şifreyi gizle" });
    expect(hide).toHaveAttribute("aria-pressed", "true");

    await user.click(hide);
    expect(password).toHaveAttribute("type", "password");
  });

  it("skips the form when a session can be restored", async () => {
    restoreSession.mockResolvedValue({ status: "authenticated", user: {} });
    search = new URLSearchParams("next=/documents");
    renderWithIntl(<LoginForm />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/documents"));
  });
});
