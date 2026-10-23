"use client";

import { CircleAlert, Lock, MoreHorizontal, Plus, RefreshCw, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/request";
import { type TeamRole, type UserInvitation, type UserResponse, useRenewInvitation, useUpdateUser, useUsers } from "@/lib/api/users";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";
import { initialsOf } from "./initials";
import { NoAccess } from "./no-access";
import { DeactivateDialog, InviteDialog, LinkDialog, RoleDialog } from "./user-dialogs";

type Tab = "all" | "active" | "invited" | "inactive";
type Status = UserResponse["status"];

const GRID = "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_56px] items-center";

const PILL: Record<Status, string> = {
  ACTIVE: "bg-status-approved-muted text-status-approved-foreground [--dot:var(--status-approved)]",
  INVITED: "bg-status-submitted-muted text-status-submitted-foreground [--dot:var(--status-submitted)]",
  INVITATION_EXPIRED: "bg-status-expiring-muted text-status-expiring-foreground [--dot:var(--status-expiring)]",
  INACTIVE: "bg-status-pending-muted text-status-pending-foreground [--dot:var(--status-pending)]",
};

function inTab(user: UserResponse, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "active") return user.status === "ACTIVE";
  if (tab === "invited") return user.status === "INVITED" || user.status === "INVITATION_EXPIRED";
  return user.status === "INACTIVE";
}

/**
 * "Kullanıcılar" (design v1.2 160–169): the company's people and roles. The owner invites with a one-time link, changes
 * roles and deactivates; an admin reads; the other roles are told to ask the owner. Nobody changes their own row.
 */
export function UsersPage() {
  const t = useTranslations("team");
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const companyName = session.status === "authenticated" ? session.user.company.name : "";
  const owner = role === "OWNER";
  const canRead = owner || role === "ADMIN";
  const users = useUsers(canRead);
  const [tab, setTab] = useState<Tab>("all");
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ invitation: UserInvitation; renewed: boolean }>();
  const [roleOf, setRoleOf] = useState<UserResponse>();
  const [deactivating, setDeactivating] = useState<UserResponse>();

  const header = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{t("title")}</h1>
        <p className="text-[13px] text-pretty text-muted-foreground">{t("sub")}</p>
      </div>
      {canRead && (
        <GuardedButton allowed={owner} className="ml-auto" onClick={() => setInviting(true)}>
          <Plus strokeWidth={1.75} aria-hidden />
          {t("invite")}
        </GuardedButton>
      )}
    </div>
  );

  if (!role) return null;
  if (!canRead) {
    return (
      <div className="flex max-w-[1080px] flex-col gap-5">
        {header}
        <NoAccess title={t("noAccessTitle")} role={role} />
      </div>
    );
  }

  const list = users.data ?? [];
  const counts: Record<Tab, number> = {
    all: list.length,
    active: list.filter((u) => inTab(u, "active")).length,
    invited: list.filter((u) => inTab(u, "invited")).length,
    inactive: list.filter((u) => inTab(u, "inactive")).length,
  };
  const shown = list.filter((u) => inTab(u, tab));
  const onlyYou = users.isSuccess && list.length === 1;

  return (
    <TooltipProvider>
      <div className="flex max-w-[1080px] flex-col gap-5">
        {header}
        {role === "ADMIN" && (
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Lock className="size-[14px] flex-none" strokeWidth={1.75} aria-hidden />
            {t("adminNote")}
          </span>
        )}
        <div role="tablist" aria-label={t("title")} className={cn("flex gap-0.5 self-start rounded-lg bg-muted p-[3px]", !users.isSuccess && "opacity-50")}>
          {(["all", "active", "invited", "inactive"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                tab === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              {t(key === "all" ? "tabAll" : key === "active" ? "tabActive" : key === "invited" ? "tabInvited" : "tabInactive")}
              <span className="font-mono text-[11px] font-medium text-muted-foreground">{users.isSuccess ? counts[key] : ""}</span>
            </button>
          ))}
        </div>

        {users.isError ? (
          <div role="alert" className="flex flex-col items-center gap-2.5 rounded-xl border bg-card px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-status-rejected-muted text-status-rejected-foreground">
              <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <strong className="text-[15px] font-semibold">{t("loadFailed")}</strong>
            <span className="text-[13px] text-muted-foreground">{t("loadFailedBody")}</span>
            <Button variant="secondary" className="mt-1" onClick={() => void users.refetch()}>
              <RefreshCw strokeWidth={1.75} aria-hidden />
              {t("retry")}
            </Button>
            {users.error instanceof ApiError && <span className="font-mono text-xs text-muted-foreground">HTTP {users.error.status} · GET /users</span>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <div role="table" aria-label={t("title")} className="min-w-[720px]">
              <div role="row" className={cn(GRID, "h-10 border-b pr-2 pl-4 text-xs font-medium text-muted-foreground")}>
                <span role="columnheader">{t("colPerson")}</span>
                <span role="columnheader">{t("colRole")}</span>
                <span role="columnheader">{t("colStatus")}</span>
                <span />
              </div>
              {users.isPending &&
                [140, 120, 160, 110, 150].map((w) => (
                  <div key={w} aria-busy="true" className={cn(GRID, "h-[60px] border-b pr-2 pl-4")}>
                    <span className="flex items-center gap-3">
                      <span className="size-8 rounded-full bg-skeleton" />
                      <span className="flex flex-col gap-1.5">
                        <span className="h-2.5 rounded bg-skeleton" style={{ width: w }} />
                        <span className="h-2 rounded bg-skeleton" style={{ width: w - 50 }} />
                      </span>
                    </span>
                    <span className="h-2.5 w-16 rounded bg-skeleton" />
                    <span className="h-5 w-[84px] rounded-full bg-skeleton" />
                    <span />
                  </div>
                ))}
              {shown.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  canChange={owner && !user.you}
                  onRole={() => setRoleOf(user)}
                  onDeactivate={() => setDeactivating(user)}
                  onRenewed={(invitation) => setLink({ invitation, renewed: true })}
                />
              ))}
              {onlyYou && (
                <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
                  <strong className="text-[15px] font-semibold">{t("emptyTitle")}</strong>
                  <span className="max-w-[440px] text-[13px] leading-normal text-pretty text-muted-foreground">{t("emptyBody")}</span>
                  {owner && (
                    <Button variant="secondary" className="mt-1" onClick={() => setInviting(true)}>
                      <Plus strokeWidth={1.75} aria-hidden />
                      {t("invite")}
                    </Button>
                  )}
                </div>
              )}
              <div className="flex h-11 items-center px-4 text-xs text-muted-foreground">{t("suppliersNote")}</div>
            </div>
          </div>
        )}
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onInvited={(invitation) => setLink({ invitation, renewed: false })} />
      <LinkDialog invitation={link?.invitation} renewed={!!link?.renewed} companyName={companyName} onClose={() => setLink(undefined)} />
      <RoleDialog key={roleOf?.id} user={roleOf} onClose={() => setRoleOf(undefined)} />
      <DeactivateDialog user={deactivating} onClose={() => setDeactivating(undefined)} />
    </TooltipProvider>
  );
}

function UserRow({
  user,
  canChange,
  onRole,
  onDeactivate,
  onRenewed,
}: {
  user: UserResponse;
  canChange: boolean;
  onRole: () => void;
  onDeactivate: () => void;
  onRenewed: (invitation: UserInvitation) => void;
}) {
  const t = useTranslations("team");
  const locale = useLocale();
  const update = useUpdateUser();
  const renew = useRenewInvitation();
  const [now] = useState(() => Date.now());
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
  const inactive = user.status === "INACTIVE";

  let note = "";
  if (user.status === "INVITED" && user.invitationExpiresAt) {
    // Counted up, as on the supplier's link: a fresh invitation has "7 gün kaldı", the last day its own words.
    const left = new Date(user.invitationExpiresAt).getTime() - now;
    note = left >= 86_400_000 ? t("invitedNote", { days: Math.ceil(left / 86_400_000) }) : t("invitedToday");
  } else if (user.status === "INVITATION_EXPIRED" && user.invitationExpiresAt) {
    note = day.format(new Date(user.invitationExpiresAt));
  } else if (inactive && user.inactiveSince) {
    note = t("inactiveSince", { date: day.format(new Date(user.inactiveSince)) });
  }

  const activate = () =>
    update.mutate({ id: user.id, active: true }, { onError: (error) => showErrorToast({ title: t("saveFailed"), error, onRetry: activate }) });
  const renewLink = () =>
    renew.mutate(user.id, { onSuccess: onRenewed, onError: (error) => showErrorToast({ title: t("saveFailed"), error, onRetry: renewLink }) });

  const trigger = (
    <button
      type="button"
      aria-label={t("actions")}
      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
    >
      <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <div role="row" className={cn(GRID, "min-h-[60px] border-b pr-2 pl-4")}>
      <span role="cell" className={cn("flex min-w-0 items-center gap-3", inactive && "opacity-60")}>
        <span className="flex size-8 flex-none items-center justify-center rounded-full bg-silk text-xs font-semibold text-[#3D3A35]">
          {initialsOf(user.fullName)}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="flex items-center gap-2 text-sm font-medium">
            {user.fullName}
            {user.you && <span className="rounded border px-1.5 py-px text-[11px] font-medium text-muted-foreground">{t("you")}</span>}
          </span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </span>
      <span role="cell" className={cn("text-[13px]", inactive && "opacity-60")}>
        {t(`role.${user.role as TeamRole}.name`)}
      </span>
      <span role="cell" className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap", PILL[user.status])}>
          <span className="size-1.5 rounded-full bg-(--dot)" aria-hidden />
          {t(`status.${user.status}`)}
        </span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
      <span role="cell" className="flex justify-end">
        {canChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={trigger} />
            <DropdownMenuContent align="end" className="w-[210px]">
              {user.status === "ACTIVE" ? (
                <>
                  <DropdownMenuItem className="h-8 px-2 text-[13px]" onClick={onRole}>
                    <ShieldCheck strokeWidth={1.75} aria-hidden />
                    {t("menuRole")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" className="h-8 px-2 text-[13px]" onClick={onDeactivate}>
                    <UserX strokeWidth={1.75} aria-hidden />
                    {t("menuDeactivate")}
                  </DropdownMenuItem>
                </>
              ) : inactive ? (
                <>
                  <DropdownMenuItem className="h-8 px-2 text-[13px]" onClick={activate}>
                    <UserCheck strokeWidth={1.75} aria-hidden />
                    {t("menuActivate")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="h-8 px-2 text-[13px]" onClick={onRole}>
                    <ShieldCheck strokeWidth={1.75} aria-hidden />
                    {t("menuRole")}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem className="h-8 px-2 text-[13px]" onClick={renewLink}>
                    <RefreshCw strokeWidth={1.75} aria-hidden />
                    {t("menuRenew")}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="h-8 px-2 text-[13px]" onClick={onRole}>
                    <ShieldCheck strokeWidth={1.75} aria-hidden />
                    {t("menuRole")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t("actions")}
                  aria-disabled="true"
                  className="flex size-8 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground opacity-45 outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden />
                </button>
              }
            />
            <TooltipContent side="bottom" align="end">
              {user.you ? t("selfTip") : <UnauthorizedTip />}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}

function UnauthorizedTip() {
  const t = useTranslations("common");
  return <>{t("readOnly")}</>;
}
