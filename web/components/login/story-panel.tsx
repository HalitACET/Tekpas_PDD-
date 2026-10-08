import { useTranslations } from "next-intl";
import { LanguageMenu } from "@/components/common/language-switcher";
import { Logo } from "@/components/brand/logo";
import { ThreadIllustration, ThreadIllustrationCompact } from "./thread-illustration";

/* Design F story side; v0.3.1 17: --story surface (cocoon cream in light, navy in dark). */

function Headline({ className }: { className: string }) {
  const t = useTranslations("login");
  return (
    <h2 className={className}>{t.rich("headline", { em: (chunks) => <em className="italic">{chunks}</em> })}</h2>
  );
}

/** Desktop: left column of the split screen. */
export function StoryPanel() {
  const t = useTranslations("login");
  return (
    <section className="hidden flex-col gap-10 border-r border-story-border bg-story px-16 py-12 text-foreground md:flex">
      <Logo size={30} cutout="var(--story)" />
      <div className="mt-10 flex max-w-[560px] flex-col gap-5">
        <span className="text-xs font-medium tracking-[0.08em] text-brand-text uppercase">
          {t("overline")}
        </span>
        <Headline className="font-serif text-[56px] leading-[1.02] font-normal tracking-[-0.025em]" />
        <p className="text-[17px] leading-[1.6] text-pretty text-muted-foreground">{t("story")}</p>
      </div>
      <div className="flex min-h-0 flex-1 items-center">
        <ThreadIllustration />
      </div>
    </section>
  );
}

/** Mobile: story on top, form below. */
export function StoryPanelCompact() {
  const t = useTranslations("login");
  return (
    <section className="flex flex-col gap-[18px] border-b border-story-border bg-story px-6 pt-14 pb-7 text-foreground md:hidden">
      <div className="flex items-center">
        <Logo size={24} cutout="var(--story)" />
        <LanguageMenu className="ml-auto" />
      </div>
      <Headline className="mt-2 font-serif text-[34px] leading-[1.05] font-normal tracking-[-0.02em]" />
      <p className="text-sm leading-[1.55] text-muted-foreground">{t("storyShort")}</p>
      <ThreadIllustrationCompact />
    </section>
  );
}
