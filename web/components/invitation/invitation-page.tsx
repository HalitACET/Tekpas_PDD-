"use client";

import { CircleAlert, Check, Clock, Dot, Link2, Lock, UserCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/brand/logo";
import { FirmTile } from "@/components/supplier/frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api/request";
import { useAcceptInvitation, usePublicInvitation } from "@/lib/api/users";
import { cn } from "@/lib/utils";

const MIN = 10;
const MAX = 72;
/** The design's large buttons: 56 px on the phone, 44 px on desktop. */
const BIG = "h-14 text-[17px] lg:h-11 lg:text-[15px]";

/** The token after "#": it never reaches the server's logs, and the page sends it in a header. */
function useHashToken(): string | null {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    () => window.location.hash.slice(1),
    () => null,
  );
}

type Invitation = NonNullable<ReturnType<typeof usePublicInvitation>["data"]>;

/**
 * The page behind an invitation link (design v1.2 170–174): who invites and as what, then a password; the account
 * is ready and the login page opens with the e-mail filled in. Expired, used and unknown links each say what to do.
 */
export function InvitationPage() {
  const t = useTranslations("invitation");
  const token = useHashToken();
  const invitation = usePublicInvitation(token);
  const [done, setDone] = useState<Invitation | null>(null);

  if (done) {
    return (
      <Frame>
        <Done invitation={done} />
      </Frame>
    );
  }
  if (token === null || (token && invitation.isPending)) {
    return (
      <Frame aside={<AsideSkeleton />}>
        <div aria-busy="true" className="flex flex-col gap-4 pt-2">
          <span className="flex items-center gap-3">
            <span className="size-11 rounded-[10px] bg-skeleton" />
            <span className="flex flex-col gap-1.5">
              <span className="h-3 w-[150px] rounded bg-skeleton" />
              <span className="h-2.5 w-[110px] rounded bg-skeleton" />
            </span>
          </span>
          <span className="h-6 w-[70%] rounded-md bg-skeleton" />
          <span className="h-[120px] w-full rounded-xl bg-skeleton" />
          <span className="h-12 w-full rounded-lg bg-skeleton" />
          <span className="text-[13px] text-muted-foreground">{t("checking")}</span>
        </div>
      </Frame>
    );
  }
  if (!token || invitation.isError) {
    const error = invitation.error;
    const problem = error instanceof ApiError ? (error.problem as (Record<string, unknown> & { reason?: string | null }) | undefined) : undefined;
    const reason = !token ? "INVITATION_INVALID" : (problem?.reason ?? (error instanceof ApiError ? `HTTP ${error.status}` : "OFFLINE"));
    if (reason === "INVITATION_EXPIRED") {
      const name = typeof problem?.invitedByName === "string" ? problem.invitedByName : undefined;
      const company = typeof problem?.companyName === "string" ? problem.companyName : undefined;
      return (
        <Frame>
          <Closed
            tone="pending"
            icon={<Clock className="size-6" strokeWidth={1.75} aria-hidden />}
            title={t("expiredTitle")}
            body={name ? t("expiredBody", { name }) : t("expiredBodyNoName")}
            code={t("error", { code: reason })}
          >
            {(name || company) && (
              <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
                <span className="text-sm text-muted-foreground lg:text-[13px]">{t("newLinkFrom")}</span>
                <span className="text-base font-medium lg:text-[15px]">{[name, company].filter(Boolean).join(" · ")}</span>
              </div>
            )}
          </Closed>
        </Frame>
      );
    }
    if (reason === "INVITATION_USED") {
      return (
        <Frame>
          <Closed
            tone="approved"
            icon={<UserCheck className="size-6" strokeWidth={1.75} aria-hidden />}
            title={t("usedTitle")}
            body={t("usedBody")}
            code={t("state", { code: reason })}
          >
            <Link href="/login" className={cn(buttonVariants(), BIG)}>
              {t("usedLogin")}
            </Link>
          </Closed>
        </Frame>
      );
    }
    return (
      <Frame>
        <Closed
          tone="pending"
          icon={<Link2 className="size-6" strokeWidth={1.75} aria-hidden />}
          title={t("invalidTitle")}
          body={t("invalidBody")}
          code={t("error", { code: reason })}
        />
      </Frame>
    );
  }

  const data = invitation.data!;
  return (
    <Frame aside={<Aside invitation={data} />}>
      <PasswordForm token={token} invitation={data} onDone={() => setDone(data)} />
    </Frame>
  );
}

/** Cream header with the lock note; on desktop the facts move to an aside next to the form (design 170 desktop). */
function Frame({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  const t = useTranslations("invitation");
  const tCommon = useTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 flex-none items-center gap-2 border-b border-story-border bg-story px-4 lg:px-16">
        <LogoMark size={22} cutout="var(--story)" />
        <span className="text-base font-semibold tracking-[-0.03em]">{tCommon("brand")}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" strokeWidth={1.75} aria-hidden />
          {t("secure")}
        </span>
      </header>
      <div className="flex flex-1 items-start justify-center gap-12 px-4 pt-4 pb-8 lg:px-16 lg:pt-12 lg:pb-16">
        {aside && <aside className="hidden w-[340px] flex-none flex-col gap-4 lg:flex">{aside}</aside>}
        <main className="flex w-full max-w-full min-w-0 flex-col gap-5 lg:w-[440px]">{children}</main>
      </div>
    </div>
  );
}

function useExpiryDate() {
  const locale = useLocale();
  return (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function Inviter({ company }: { company: string }) {
  const t = useTranslations("invitation");
  return (
    <div className="flex items-center gap-3">
      <FirmTile name={company} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{company}</span>
        <span className="text-[13px] text-muted-foreground">{t("invitedYou")}</span>
      </span>
    </div>
  );
}

/** Name, e-mail and role with what the role may do: larger on the phone, compact in the desktop aside. */
function Facts({ invitation, compact }: { invitation: Invitation; compact?: boolean }) {
  const t = useTranslations("invitation");
  const tTeam = useTranslations("team");
  const role = invitation.role === "SUPPLIER" ? null : invitation.role;
  const rows = [
    { label: t("fullName"), value: invitation.fullName },
    { label: t("email"), value: invitation.email },
    { label: t("role"), value: role ? tTeam(`role.${role}.name`) : invitation.role, desc: role ? tTeam(`role.${role}.desc`) : undefined },
  ];
  return (
    <dl className="rounded-xl border bg-card">
      {rows.map((row, i) => (
        <div key={row.label} className={cn("flex flex-col gap-0.5 px-4 py-3", i < rows.length - 1 && "border-b")}>
          <dt className={cn("text-muted-foreground", compact ? "text-xs" : "text-[13px]")}>{row.label}</dt>
          <dd className={cn("font-medium break-words", compact ? "text-sm" : "text-base")}>{row.value}</dd>
          {row.desc && (
            <dd className={cn("leading-normal text-pretty text-muted-foreground", compact ? "text-xs" : "text-sm")}>{row.desc}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Aside({ invitation }: { invitation: Invitation }) {
  const t = useTranslations("invitation");
  const date = useExpiryDate();
  return (
    <>
      <Inviter company={invitation.companyName} />
      <Facts invitation={invitation} compact />
      <div className="flex gap-2.5 rounded-xl bg-muted px-4 py-3.5 text-[13px] leading-normal">
        <Lock className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span>
          <span className="font-medium">{t("privateAside")}</span> {t("privateAsideBody", { date: date(invitation.expiresAt) })}
        </span>
      </div>
      {invitation.invitedByName && (
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-muted-foreground">{t("invitedBy")}</span>
          <span className="font-medium">
            {invitation.invitedByName} · {invitation.companyName}
          </span>
        </div>
      )}
    </>
  );
}

function AsideSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <span className="flex items-center gap-3">
        <span className="size-11 rounded-[10px] bg-skeleton" />
        <span className="h-3 w-[150px] rounded bg-skeleton" />
      </span>
      <span className="h-[180px] w-full rounded-xl bg-skeleton" />
    </div>
  );
}

const inputClass =
  "h-[52px] w-full min-w-0 rounded-lg border bg-card px-3 text-[17px] font-normal outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft lg:h-10 lg:text-sm";

function PasswordForm({ token, invitation, onDone }: { token: string; invitation: Invitation; onDone: () => void }) {
  const t = useTranslations("invitation");
  const date = useExpiryDate();
  const accept = useAcceptInvitation(token);
  const ids = { rule: useId(), mismatch: useId() };
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);

  const longEnough = password.length >= MIN;
  const short = tried && !longEnough;
  const mismatch = tried && longEnough && again !== password;
  const firstName = invitation.fullName.trim().split(/\s+/)[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!longEnough || again !== password || accept.isPending) return;
    accept.mutate(password, { onSuccess: onDone });
  };

  const rule = longEnough
    ? { className: "text-status-approved-foreground", icon: <Check className="size-3.5 flex-none" strokeWidth={2} aria-hidden />, text: t("rule") }
    : short && password
      ? {
          className: "text-status-rejected-foreground",
          icon: <X className="size-3.5 flex-none" strokeWidth={2} aria-hidden />,
          text: t("ruleShort", { count: password.length }),
        }
      : { className: "text-muted-foreground", icon: <Dot className="size-3.5 flex-none" strokeWidth={2} aria-hidden />, text: t("rule") };
  const failure = accept.error;

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div className="lg:hidden">
        <Inviter company={invitation.companyName} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[30px] leading-[38px] font-normal tracking-[-0.015em] lg:text-[32px] lg:leading-10">
          {t("welcome", { name: firstName })}
        </h1>
        <p className="text-base leading-[1.55] text-pretty text-muted-foreground lg:text-[15px]">{t("intro")}</p>
      </div>
      <div className="lg:hidden">
        <Facts invitation={invitation} />
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4 lg:rounded-xl lg:border lg:bg-card lg:p-6">
        <label className="flex flex-col gap-1.5 text-[15px] font-medium lg:text-[13px]">
          {t("password")}
          <span className="relative flex">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={MAX}
              aria-invalid={short}
              aria-describedby={ids.rule}
              className={cn(inputClass, "pr-[72px]", short ? "border-status-rejected" : "border-input")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-1 right-1 cursor-pointer rounded-md px-3 text-[15px] font-medium text-muted-foreground hover:bg-accent lg:text-[13px]"
            >
              {show ? t("hide") : t("show")}
            </button>
          </span>
          <span id={ids.rule} className={cn("flex items-center gap-1.5 text-sm font-normal lg:text-[13px]", rule.className)}>
            {rule.icon}
            {rule.text}
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-[15px] font-medium lg:text-[13px]">
          {t("passwordAgain")}
          <input
            type={show ? "text" : "password"}
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            maxLength={MAX}
            aria-invalid={mismatch}
            aria-describedby={mismatch ? ids.mismatch : undefined}
            className={cn(inputClass, mismatch ? "border-status-rejected" : "border-input")}
          />
          {mismatch && (
            <span id={ids.mismatch} role="alert" className="text-sm font-normal text-status-rejected-foreground lg:text-[13px]">
              {t("mismatch")}
            </span>
          )}
        </label>
        {failure && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-lg border border-status-rejected bg-status-rejected-muted px-3.5 py-3 text-sm leading-[1.45] text-status-rejected-foreground lg:text-[13px]"
          >
            <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.75} aria-hidden />
            <span className="flex flex-col gap-1">
              <span>{t("saveFailed")}</span>
              <span className="font-mono text-xs">{t("error", { code: failure instanceof ApiError ? failure.status : "OFFLINE" })}</span>
            </span>
          </div>
        )}
        <Button type="submit" disabled={accept.isPending} className={cn(BIG, "gap-2")}>
          {accept.isPending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
          {accept.isPending ? t("submitting") : t("submit")}
        </Button>
      </form>
      <p className="text-center text-sm leading-normal text-pretty text-muted-foreground lg:hidden">
        {t("private", { date: date(invitation.expiresAt) })}
      </p>
    </div>
  );
}

function Done({ invitation }: { invitation: Invitation }) {
  const t = useTranslations("invitation");
  const tTeam = useTranslations("team");
  const role = invitation.role === "SUPPLIER" ? invitation.role : tTeam(`role.${invitation.role}.name`);
  return (
    <div className="flex flex-col gap-5 pt-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-status-approved-muted text-status-approved-foreground">
        <Check className="size-[26px]" strokeWidth={2} aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[30px] leading-[38px] font-normal tracking-[-0.015em] lg:text-[32px] lg:leading-10">{t("doneTitle")}</h1>
        <p className="text-base leading-[1.55] text-pretty text-muted-foreground lg:text-[15px]">
          {t("doneBody", { company: invitation.companyName, role })}
        </p>
      </div>
      <Link href={`/login?email=${encodeURIComponent(invitation.email)}`} className={cn(buttonVariants(), BIG)}>
        {t("login")}
      </Link>
      <span className="text-sm text-muted-foreground lg:text-[13px]">{invitation.email}</span>
    </div>
  );
}

function Closed({
  tone,
  icon,
  title,
  body,
  code,
  children,
}: {
  tone: "pending" | "approved";
  icon: ReactNode;
  title: string;
  body: string;
  code: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 pt-6">
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          tone === "approved" ? "bg-status-approved-muted text-status-approved-foreground" : "bg-status-pending-muted text-status-pending-foreground",
        )}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[30px] leading-[38px] font-normal tracking-[-0.015em] lg:text-[32px] lg:leading-10">{title}</h1>
        <p className="text-base leading-[1.55] text-pretty text-muted-foreground lg:text-[15px]">{body}</p>
      </div>
      {children}
      <span className="font-mono text-xs text-muted-foreground">{code}</span>
    </div>
  );
}
