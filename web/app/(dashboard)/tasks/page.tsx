import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TasksPage } from "@/components/tasks/tasks-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.tasks");
  return { title: t("title") };
}

export default function Page() {
  return <TasksPage />;
}
