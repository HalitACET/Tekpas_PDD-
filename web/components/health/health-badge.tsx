import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { backendOrigin } from "@/lib/env";

type HealthStatus = "up" | "down";

// Actuator is not part of the OpenAPI contract, so this is the one place that uses fetch
// directly instead of @tekpas/api-client. It runs on the server, so no CORS is involved.
async function fetchHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${backendOrigin}/actuator/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "down";
    const body: { status?: string } = await res.json();
    return body.status === "UP" ? "up" : "down";
  } catch {
    return "down";
  }
}

export async function HealthBadge() {
  const [status, t] = await Promise.all([fetchHealth(), getTranslations("health")]);

  return (
    <Badge
      variant={status === "up" ? "secondary" : "destructive"}
      className={status === "up" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : undefined}
    >
      {t("label")}: {t(status)}
    </Badge>
  );
}

export async function HealthBadgeFallback() {
  const t = await getTranslations("health");
  return (
    <Badge variant="outline">
      {t("label")}: {t("checking")}
    </Badge>
  );
}
