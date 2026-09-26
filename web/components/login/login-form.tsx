"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { login, type LoginResult, restoreSession } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting" | Exclude<LoginResult, "ok">;

/**
 * Design F form. Sizes follow the design per breakpoint: 40 px controls on desktop, 48 px (and 16 px
 * text, no iOS zoom) on mobile. Every failed attempt shows one generic message; nothing reveals which
 * of e-mail or password was wrong.
 */
export function LoginForm() {
  const t = useTranslations("login");
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const ids = { email: useId(), password: useId(), remember: useId(), error: useId() };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  // Already signed in (refresh cookie still valid): skip the form.
  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((session) => {
      if (!cancelled && session.status === "authenticated") router.replace(next);
    });
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    const result = await login(email.trim(), password, remember);
    if (result === "ok") {
      router.replace(next);
    } else {
      setStatus(result);
    }
  }

  const submitting = status === "submitting";
  const error = status === "invalid" ? t("invalidCredentials") : status === "unavailable" ? t("serverError") : null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-describedby={error ? ids.error : undefined}
      // Design text blocks use the browser's default line-height ("normal"), not the 20 px body default.
      className="flex flex-1 flex-col gap-[18px] leading-[normal] md:flex-none md:gap-6"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] leading-[normal] font-semibold tracking-[-0.02em] md:text-2xl md:leading-[normal]">{t("title")}</h1>
        <p className="hidden text-sm leading-[normal] text-muted-foreground md:block">{t("subtitle")}</p>
      </div>

      {error && (
        <div
          id={ids.error}
          role="alert"
          className="flex gap-2.5 rounded-lg bg-status-rejected-muted p-3 text-[13px] leading-[1.45] text-status-rejected-foreground"
        >
          <CircleAlert className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-[18px] md:gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-sm leading-[normal] font-medium md:text-[13px]">
            {t("email")}
          </label>
          <Input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            aria-invalid={status === "invalid" || undefined}
            className="h-12 rounded-lg px-3.5 text-base shadow-none md:h-10 md:rounded-md md:px-3 md:text-sm md:shadow-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.password} className="text-sm leading-[normal] font-medium md:text-[13px]">
            {t("password")}
          </label>
          <div className="relative flex">
            <Input
              id={ids.password}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              aria-invalid={status === "invalid" || undefined}
              className="h-12 rounded-lg pr-12 pl-3.5 text-base shadow-none md:h-10 md:rounded-md md:pr-10 md:pl-3 md:text-sm md:shadow-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showPassword}
              aria-controls={ids.password}
              className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/18 md:w-10 md:rounded-r-md"
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" strokeWidth={1.75} aria-hidden />
              ) : (
                <Eye className="size-[18px]" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>
        </div>

        <div className="flex min-h-11 items-center text-sm md:min-h-0 md:text-[13px]">
          <label className="flex cursor-pointer items-center gap-2.5 md:gap-2">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
              aria-labelledby={ids.remember}
              className="size-5 rounded-[5px] md:size-4 md:rounded-sm [&_svg]:size-3.5 md:[&_svg]:size-3"
            />
            <span id={ids.remember} className="leading-[normal]">{t("rememberMe")}</span>
          </label>
        </div>
      </div>

      <Button
        type="submit"
        size="xl"
        disabled={submitting}
        aria-busy={submitting || undefined}
        className={cn("mt-auto w-full md:mt-0 md:h-10 md:rounded-md md:text-sm", submitting && "disabled:opacity-100")}
      >
        {submitting && (
          <span
            className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent"
            aria-hidden
          />
        )}
        {submitting ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-xs leading-[1.5] text-muted-foreground">{t("forgotPassword")}</p>
    </form>
  );
}
