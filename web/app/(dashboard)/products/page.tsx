import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProductsPage } from "@/components/products/products-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.products");
  return { title: t("title") };
}

export default function Page() {
  return <ProductsPage />;
}
