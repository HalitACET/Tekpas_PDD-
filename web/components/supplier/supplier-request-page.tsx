"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ServerWakeStrip, useListWake } from "@/components/common/server-wake";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type PublicSubmitResponse, usePublicRequest } from "@/lib/api/public-request";
import { ApiError } from "@/lib/api/request";
import { queryKeys } from "@/lib/query-keys";
import type { SubmissionValues } from "@/lib/supplier-request/form";
import { ClosedLink, closedKindOf } from "./closed-link";
import { Confirmation } from "./confirmation";
import { SupplierFrame } from "./frame";
import { FormAside, RequestForm } from "./request-form";
import { Welcome } from "./welcome";

/**
 * The token is the fragment of the address (K21): it stays in the browser, no server, log or analytics sees
 * it. Null on the server and while hydrating, then the fragment ("" when there is none).
 */
function useToken(): string | null {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    () => window.location.hash.slice(1),
    () => null,
  );
}

function PageSkeleton() {
  const t = useTranslations("supplier");
  return (
    <div role="status" aria-label={t("loading")} className="flex flex-col gap-5 pt-2">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-[10px]" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}

/** A message with an icon-less title and a retry: the wake-up gave up, the server failed or the limit was hit. */
function Notice({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  const t = useTranslations("supplier");
  return (
    <div role="alert" className="flex flex-col gap-4 pt-4">
      <h1 className="font-serif text-[30px] leading-[1.1] font-normal tracking-[-0.02em]">{title}</h1>
      <p className="text-base leading-[1.55] text-pretty text-muted-foreground">{body}</p>
      {onRetry && (
        <Button variant="secondary" size="lg" className="w-fit" onClick={onRetry}>
          <RefreshCw strokeWidth={1.75} aria-hidden />
          {t("wake.retry")}
        </Button>
      )}
    </div>
  );
}

type Screen = { name: "welcome" } | { name: "form" } | { name: "done"; response: PublicSubmitResponse; values: SubmissionValues; documents: string[] };

/**
 * /r#<token> (design v0.4 39–45): opens the link once, then welcome → form → confirmation; a link that is
 * expired, revoked, used or unknown shows its page (44). A sleeping server is waited for like in the panel
 * (lib/server-wake.ts), the page then asks once more.
 */
export function SupplierRequestPage() {
  const t = useTranslations("supplier");
  const tStep = useTranslations("enums.stepType");
  const token = useToken();
  const query = usePublicRequest(token);
  const { wake, retry } = useListWake(query, queryKeys.publicRequest.view);
  const [screen, setScreen] = useState<Screen>({ name: "welcome" });
  const [closed, setClosed] = useState<ApiError | undefined>();
  const [now] = useState(() => new Date());

  // The answer of a waking server comes as a 503 once it has started: ask again, once.
  const waking503 = query.error instanceof ApiError && query.error.status === 503;
  const asked = query.errorUpdateCount;
  const stillWaking = waking503 && asked < 2;
  useEffect(() => {
    if (waking503 && asked === 1) void query.refetch();
  }, [waking503, asked, query]);

  if (token === null) {
    return (
      <SupplierFrame>
        <PageSkeleton />
      </SupplierFrame>
    );
  }
  // No fragment: nothing to ask the server.
  if (token === "") {
    return (
      <SupplierFrame>
        <ClosedLink kind="INVALID" />
      </SupplierFrame>
    );
  }

  const error = closed ?? (query.error instanceof ApiError ? query.error : undefined);
  const view = query.data;

  if (view && !closed) {
    const stepName = tStep(view.stepType);
    if (screen.name === "done") {
      return (
        <SupplierFrame>
          <Confirmation view={view} response={screen.response} values={screen.values} documents={screen.documents} stepName={stepName} />
        </SupplierFrame>
      );
    }
    // A correction opens on the form (45); the first request starts with the welcome (39).
    const showForm = screen.name === "form" || !!view.rejection;
    return (
      <SupplierFrame aside={showForm ? <FormAside view={view} stepName={stepName} now={now} /> : undefined}>
        {showForm ? (
          <RequestForm
            view={view}
            token={token}
            stepName={stepName}
            onSent={(response, values, documents) => setScreen({ name: "done", response, values, documents })}
            onClosed={setClosed}
          />
        ) : (
          <Welcome view={view} stepName={stepName} now={now} onStart={() => setScreen({ name: "form" })} />
        )}
      </SupplierFrame>
    );
  }

  if (error && !stillWaking) {
    if (error.status === 404 || error.status === 410) {
      const reason = error.problem?.reason ?? (error.status === 404 ? "LINK_INVALID" : undefined);
      return (
        <SupplierFrame>
          <ClosedLink kind={closedKindOf(reason)} link={error.problem?.link} />
        </SupplierFrame>
      );
    }
    if (error.status === 429) {
      return (
        <SupplierFrame>
          <Notice title={t("rateLimited.title")} body={t("rateLimited.body")} onRetry={() => void query.refetch()} />
        </SupplierFrame>
      );
    }
    return (
      <SupplierFrame>
        <Notice title={t("loadError.title")} body={t("loadError.body")} onRetry={() => void query.refetch()} />
      </SupplierFrame>
    );
  }

  if (query.isError && !error) {
    // No answer at all (offline, unreachable).
    return (
      <SupplierFrame>
        <Notice title={t("loadError.title")} body={t("loadError.body")} onRetry={() => void query.refetch()} />
      </SupplierFrame>
    );
  }

  return (
    <SupplierFrame>
      {wake.phase === "gaveUp" ? (
        <Notice title={t("wake.gaveUpTitle")} body={t("wake.gaveUpBody")} onRetry={retry} />
      ) : (
        <>
          {wake.phase === "waking" && <ServerWakeStrip startedAt={wake.startedAt} body="formBody" />}
          <PageSkeleton />
        </>
      )}
    </SupplierFrame>
  );
}
