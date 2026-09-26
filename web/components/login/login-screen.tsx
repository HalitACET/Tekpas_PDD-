import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { LoginForm } from "./login-form";
import { StoryPanel, StoryPanelCompact } from "./story-panel";

/** Design F: split screen from md up (story 1.15fr · form 1fr), stacked on mobile. */
export function LoginScreen() {
  const t = useTranslations("login");
  return (
    <div className="flex min-h-dvh flex-col bg-card md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <StoryPanel />
      <StoryPanelCompact />
      <main className="flex flex-1 flex-col p-6 md:px-16 md:py-12">
        <LanguageSwitcher appearance="plain" className="hidden justify-end md:flex" />
        <div className="flex flex-1 md:items-center md:justify-center">
          <div className="flex w-full flex-col md:w-[380px]">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <footer className="hidden text-xs text-muted-foreground md:block">{t("footer")}</footer>
      </main>
    </div>
  );
}
