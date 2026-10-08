import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SuppliersPage } from "@/components/suppliers/suppliers-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.suppliers");
  return { title: t("title") };
}

export default function Page() {
  return <SuppliersPage />;
}
