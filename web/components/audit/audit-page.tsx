"use client";

import { ChevronDown, CircleAlert, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/components/users/initials";
import { NoAccess } from "@/components/users/no-access";
import { AUDIT_TYPES, type AuditEntry, type AuditFilters, type AuditTypeFilter, useAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/request";
import { useUsers } from "@/lib/api/users";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";

type Range = "7" | "30" | "all";

const ZONE = "Europe/Istanbul";
const GRID = "grid grid-cols-[72px_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1.9fr)_minmax(0,1.9fr)] gap-3 items-center";

/** An ISO day in Turkish time. */
function isoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(date);
}

function fromOf(range: Range, now: number): string | undefined {
  if (range === "all") return undefined;
  const days = range === "7" ? 6 : 29;
  return isoDay(new Date(now - days * 86_400_000));
}

/**
 * "Denetim izi" (design v1.2 180–184): who changed what and when, newest first and grouped by day, filtered by type,
 * person and date range, 25 a page. Owners and admins read it; the others are told whom to ask.
 */
export function AuditPage() {
  const t = useTranslations("audit");
  const locale = useLocale();
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const canRead = role === "OWNER" || role === "ADMIN";
  const [type, setType] = useState<AuditTypeFilter | "">("");
  const [userId, setUserId] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [page, setPage] = useState(0);
  const [now] = useState(() => Date.now());
  const filters: AuditFilters = { type: type || undefined, userId: userId || undefined, from: fromOf(range, now) };
  const audit = useAudit(filters, page, canRead);
  const users = useUsers(canRead);
  const number = new Intl.NumberFormat(locale);

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{t("title")}</h1>
      <p className="text-[13px] text-pretty text-muted-foreground">{t("sub")}</p>
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

  const filtered = !!(type || userId);
  const clear = () => {
    setType("");
    setUserId("");
    setPage(0);
  };
  const data = audit.data;
  const entries = data?.entries ?? [];
  const busy = audit.isPending || audit.isError;

  return (
    <div className="flex max-w-[1080px] flex-col gap-5">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <Filter
          label={t("filterType")}
          value={type}
          active={!!type}
          onChange={(v) => {
            setType(v as AuditTypeFilter | "");
            setPage(0);
          }}
          options={[
            { value: "", label: t("all") },
            ...(Object.keys(AUDIT_TYPES) as AuditTypeFilter[]).map((k) => ({ value: k, label: t(`type.${k}`) })),
          ]}
        />
        <Filter
          label={t("filterWho")}
          value={userId}
          active={!!userId}
          onChange={(v) => {
            setUserId(v);
            setPage(0);
          }}
          options={[{ value: "", label: t("everyone") }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))]}
        />
        <Filter
          label={t("filterDate")}
          value={range}
          active={false}
          onChange={(v) => {
            setRange(v as Range);
            setPage(0);
          }}
          options={[
            { value: "7", label: t("last7") },
            { value: "30", label: t("last30") },
            { value: "all", label: t("allTime") },
          ]}
        />
        {filtered && (
          <button type="button" onClick={clear} className="h-8 cursor-pointer px-2 text-[13px] font-medium underline-offset-4 hover:underline">
            {t("clear")}
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {data && !busy ? t("count", { count: number.format(data.total) }) : ""}
        </span>
      </div>

      {audit.isError ? (
        <div role="alert" className="flex flex-col items-center gap-2.5 rounded-xl border bg-card px-6 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-status-rejected-muted text-status-rejected-foreground">
            <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
          <strong className="text-[15px] font-semibold">{t("loadFailed")}</strong>
          <span className="text-[13px] text-muted-foreground">{t("loadFailedBody")}</span>
          <Button variant="secondary" className="mt-1" onClick={() => void audit.refetch()}>
            <RefreshCw strokeWidth={1.75} aria-hidden />
            {t("retry")}
          </Button>
          {audit.error instanceof ApiError && <span className="font-mono text-xs text-muted-foreground">HTTP {audit.error.status} · GET /audit</span>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <div role="table" aria-label={t("title")} className="min-w-[900px]">
            <div role="row" className={cn(GRID, "h-10 border-b px-4 text-xs font-medium text-muted-foreground")}>
              <span role="columnheader">{t("colTime")}</span>
              <span role="columnheader">{t("colWho")}</span>
              <span role="columnheader">{t("colAction")}</span>
              <span role="columnheader">{t("colRecord")}</span>
              <span role="columnheader">{t("colChange")}</span>
            </div>
            {audit.isPending &&
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} aria-busy="true" className={cn(GRID, "h-[52px] border-b px-4")}>
                  <span className="h-2.5 w-10 rounded bg-skeleton" />
                  <span className="flex items-center gap-2">
                    <span className="size-6 rounded-full bg-skeleton" />
                    <span className="h-2.5 w-24 rounded bg-skeleton" />
                  </span>
                  <span className="h-2.5 w-20 rounded bg-skeleton" />
                  <span className="h-2.5 w-32 rounded bg-skeleton" />
                  <span className="h-2.5 w-28 rounded bg-skeleton" />
                </div>
              ))}
            <EntryGroups entries={entries} now={now} />
            {data && entries.length === 0 && (
              <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
                <strong className="text-[15px] font-semibold">{filtered || range !== "all" ? t("emptyTitle") : t("noneTitle")}</strong>
                <span className="text-[13px] text-muted-foreground">{filtered || range !== "all" ? t("emptyBody") : t("noneBody")}</span>
                {filtered && (
                  <Button variant="secondary" className="mt-1" onClick={clear}>
                    {t("clear")}
                  </Button>
                )}
              </div>
            )}
            {data && entries.length > 0 && (
              <div className="flex items-center gap-2 border-t px-4 py-2.5">
                <span className="mr-auto text-xs text-muted-foreground">
                  {t("page", {
                    from: number.format(data.page * data.size + 1),
                    to: number.format(data.page * data.size + entries.length),
                    total: number.format(data.total),
                  })}
                </span>
                <Button variant="secondary" size="sm" disabled={data.page === 0} onClick={() => setPage(data.page - 1)}>
                  {t("previous")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(data.page + 1) * data.size >= data.total}
                  onClick={() => setPage(data.page + 1)}
                >
                  {t("next")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  active,
  options,
  onChange,
}: {
  label: string;
  value: string;
  active: boolean;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cn(
        "relative flex h-8 items-center gap-1.5 rounded-md border pr-8 pl-2.5 text-[13px] focus-within:ring-[3px] focus-within:ring-ring-soft",
        active ? "border-ring bg-accent" : "border-input bg-card",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{options.find((o) => o.value === value)?.label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
    </label>
  );
}

/** Entries under a band per day: "Bugün 23 Ekim 2026", "Dün …", then the weekday. */
function EntryGroups({ entries, now }: { entries: AuditEntry[]; now: number }) {
  const t = useTranslations("audit");
  const locale = useLocale();
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(iso));
  const today = isoDay(new Date(now));
  const yesterday = isoDay(new Date(now - 86_400_000));
  const long = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: ZONE });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: ZONE });

  const groups: { key: string; first: string; items: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const key = day(entry.at);
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(entry);
    else groups.push({ key, first: entry.at, items: [entry] });
  }

  return groups.map((group) => {
    const label = group.key === today ? t("today") : group.key === yesterday ? t("yesterday") : weekday.format(new Date(group.first));
    return (
      <div key={group.key} role="rowgroup">
        <div role="row" className="flex items-baseline gap-2 border-b bg-muted px-4 py-2 text-[13px]">
          <strong className="font-semibold">{label.charAt(0).toLocaleUpperCase(locale) + label.slice(1)}</strong>
          <span className="text-muted-foreground">{long.format(new Date(group.first))}</span>
        </div>
        {group.items.map((entry) => (
          <Row key={entry.id} entry={entry} time={time.format(new Date(entry.at))} />
        ))}
      </div>
    );
  });
}

function Row({ entry, time }: { entry: AuditEntry; time: string }) {
  const t = useTranslations("audit");
  const who = entry.userName ?? t("system");
  return (
    <div role="row" className={cn(GRID, "min-h-[52px] border-b px-4 py-2 text-[13px]")}>
      <span role="cell" className="font-mono text-[13px] text-muted-foreground tabular-nums">
        {time}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-2">
        <span className="flex size-6 flex-none items-center justify-center rounded-full bg-silk text-[10px] font-semibold text-[#3D3A35]">
          {entry.userName ? initialsOf(entry.userName) : "—"}
        </span>
        <span className="truncate">{who}</span>
      </span>
      <span role="cell" className="font-medium">
        <ActionText entry={entry} />
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{t.has(`type.${entry.entityType}`) ? t(`type.${entry.entityType}` as never) : entry.entityType}</span>
        <RecordText entry={entry} />
      </span>
      <span role="cell" className="min-w-0 font-mono text-xs break-words text-muted-foreground">
        <DiffText entry={entry} />
      </span>
    </div>
  );
}

function ActionText({ entry }: { entry: AuditEntry }) {
  const t = useTranslations("audit");
  const key =
    entry.entityType === "SUPPLIER" && entry.action === "CREATE"
      ? "SUPPLIER_CREATE"
      : entry.entityType === "TRANSLATION" && entry.action === "APPROVE"
        ? "TRANSLATION_APPROVE"
        : entry.action;
  return <>{t.has(`action.${key}`) ? t(`action.${key}` as never) : entry.action}</>;
}

/** The record as people know it; a step adds its stage, a document its type. */
function RecordText({ entry }: { entry: AuditEntry }) {
  const tStep = useTranslations("enums.stepType");
  const tDoc = useTranslations("enums.docType");
  const details = entry.details as Record<string, unknown>;
  const mono = ["BATCH", "PASSPORT", "STEP", "TRANSLATION", "IMPORT", "ISSUE"].includes(entry.entityType);
  let text: ReactNode = entry.label ?? "—";
  if (entry.entityType === "STEP" && typeof details.stepType === "string") {
    text = `${entry.label ?? ""} · ${tStep(details.stepType as never)}`;
  } else if (entry.entityType === "DOCUMENT" && typeof details.docType === "string") {
    text = `${tDoc.has(details.docType as never) ? tDoc(details.docType as never) : details.docType} · ${entry.label ?? ""}`;
  }
  return <span className={cn("truncate", mono && "font-mono")}>{text}</span>;
}

/** What changed, in a short line: field names, a role from and to, a version, counts. */
function DiffText({ entry }: { entry: AuditEntry }) {
  const t = useTranslations("audit");
  const tTeam = useTranslations("team");
  const tStepField = useTranslations("batches.chain.panel.fields");
  const tSupplierField = useTranslations("supplier.done.rows");
  const d = entry.details as Record<string, unknown>;
  const roleName = (r: unknown) => (typeof r === "string" && tTeam.has(`role.${r}.name`) ? tTeam(`role.${r}.name` as never) : String(r));
  // Record fields have their own names; a step's fields are named as on the step panel and the supplier's form.
  const fieldName = (f: unknown) => {
    if (typeof f !== "string") return String(f);
    if (t.has(`field.${f}`)) return t(`field.${f}` as never);
    if (tStepField.has(f as never)) return tStepField(f as never);
    if (tSupplierField.has(f as never)) return tSupplierField(f as never);
    return f;
  };
  const yesNo = (v: unknown) => (v ? t("diff.yes") : t("diff.no"));

  const parts: string[] = [];
  if (Array.isArray(d.role) && d.role.length === 2) parts.push(t("diff.roleChange", { from: roleName(d.role[0]), to: roleName(d.role[1]) }));
  else if (typeof d.role === "string") parts.push(t("diff.role", { role: roleName(d.role) }));
  if (Array.isArray(d.active) && d.active.length === 2) parts.push(t("diff.active", { from: yesNo(d.active[0]), to: yesNo(d.active[1]) }));
  if (typeof d.version === "number") parts.push(t("diff.version", { version: d.version }));
  if (typeof d.created === "number" && typeof d.failed === "number") parts.push(t("diff.imported", { created: d.created, failed: d.failed }));
  if (Array.isArray(d.languages) && d.languages.length > 0) parts.push(t("diff.languages", { languages: d.languages.join(", ") }));
  if (Array.isArray(d.fields) && d.fields.length > 0) {
    const fields = d.fields.map(fieldName).join(", ");
    parts.push(entry.action === "REJECT" ? t("diff.rejected", { fields }) : t("diff.fields", { fields }));
  }
  if (typeof d.code === "string") parts.push(t("diff.code", { code: d.code }));
  return <>{parts.length > 0 ? parts.join(" · ") : "—"}</>;
}
