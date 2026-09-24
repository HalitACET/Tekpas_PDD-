import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { HealthBadge, HealthBadgeFallback } from "@/components/health/health-badge";

export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
      <Suspense fallback={<HealthBadgeFallback />}>
        <HealthBadge />
      </Suspense>
    </main>
  );
}
