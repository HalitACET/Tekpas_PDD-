"use client";

import { CircleAlert, Clock, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { login, type LoginResult, restoreSession } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/use-session";
import { formatElapsed, WAKE_DETECT_MS, WAKE_LIMIT_MS, waitUntilAwake } from "@/lib/server-wake";
import { cn } from "@/lib/utils";

/** waking: the server is starting (31a); gaveUp: it did not start within 3 minutes (31b). */
type Status = "idle" | "submitting" | "waking" | "gaveUp" | "invalid" | "unavailable";

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
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const abort = useRef<AbortController | null>(null);

  // The elapsed time of 31a, once a second.
  useEffect(() => {
    if (status !== "waking") return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [status]);

  // Leaving the page stops the polling.
  useEffect(() => () => abort.current?.abort(), []);

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

  /**
   * Design v0.3.2 31: a login that does not answer within 3 s (or meets Render's waking page) is given up; a
   * long liveness request waits for the server (lib/server-wake.ts), then the login is sent once more. The password stays in this
   * component's state only.
   */
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting" || status === "waking") return;
    const started = Date.now();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus("submitting");

    let result: LoginResult = await login(email.trim(), password, remember, { timeoutMs: WAKE_DETECT_MS });
    if (result === "unreachable") {
      setStartedAt(started);
      setNow(Date.now());
      setStatus("waking");
      const awake = await waitUntilAwake(started, controller.signal);
      if (controller.signal.aborted) return;
      if (!awake) {
        setStatus("gaveUp");
        return;
      }
      result = await login(email.trim(), password, remember);
      if (result === "unreachable") result = "unavailable";
    }
    if (controller.signal.aborted) return;
    if (result === "ok") {
      router.replace(next);
    } else {
      setStatus(result);
    }
  }

  const submitting = status === "submitting" || status === "waking";
  const elapsed = Math.min(Math.max(0, now - startedAt), WAKE_LIMIT_MS);
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
          className="flex items-center gap-2.5 rounded-lg bg-status-rejected-muted p-3 text-[13px] leading-[1.45] text-status-rejected-foreground"
        >
          <CircleAlert className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="font-medium">{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-[18px] md:gap-4">
        {/* aria-invalid marks the fields for screen readers; the design shows the error only in the alert. */}
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
            className="h-12 rounded-lg px-3.5 text-base shadow-none aria-invalid:border-input aria-invalid:ring-0 md:h-10 md:rounded-md md:px-3 md:text-sm md:shadow-xs"
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
              className="h-12 rounded-lg pr-12 pl-3.5 text-base shadow-none aria-invalid:border-input aria-invalid:ring-0 md:h-10 md:rounded-md md:pr-10 md:pl-3 md:text-sm md:shadow-xs"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              aria-pressed={showPassword}
              aria-controls={ids.password}
              className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft md:w-10 md:rounded-r-md"
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
        {submitting ? t("submitting") : status === "gaveUp" ? t("retry") : t("submit")}
      </Button>

      {status === "waking" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2.5 rounded-lg bg-muted p-3.5">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-px size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="flex flex-col gap-[3px]">
              <span className="text-[13px] font-medium">{t("wakingTitle")}</span>
              <span className="text-xs leading-normal text-muted-foreground">{t("wakingBody")}</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-1 flex-1 overflow-hidden rounded-[2px] bg-border"
              role="progressbar"
              aria-label={t("wakingProgress")}
              aria-valuemin={0}
              aria-valuemax={WAKE_LIMIT_MS / 1000}
              aria-valuenow={Math.floor(elapsed / 1000)}
            >
              <span
                className="rounded-[2px] bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${(elapsed / WAKE_LIMIT_MS) * 100}%` }}
              />
            </span>
            <span className="font-mono text-xs font-medium tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{t("wakingUsually")}</span>
        </div>
      )}

      {status === "gaveUp" && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-[1.45]">
          <Clock className="mt-px size-[18px] shrink-0 text-status-expiring" strokeWidth={1.75} aria-hidden />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{t("gaveUpTitle")}</span>
            <span className="text-xs text-muted-foreground">{t("gaveUpBody")}</span>
          </span>
        </div>
      )}

      <p className="text-center text-xs leading-[1.5] text-muted-foreground">{t("forgotPassword")}</p>
    </form>
  );
}
