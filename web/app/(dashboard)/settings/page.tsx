import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageView } from "@/components/shell/page-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.settings");
  return { title: t("title") };
}

export default function Page() {
  return <PageView page="settings" />;
}
