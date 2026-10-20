import { parseDigitalLink } from "@tekpas/shared";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PassportFrame } from "@/components/passport/passport-frame";
import { PassportMissing, PassportPreparing } from "@/components/passport/passport-states";
import { PassportView } from "@/components/passport/passport-view";
import { type LoadedPassport, loadPassport, PassportNotFound } from "@/lib/passport/load";

/**
 * The passport page a QR code opens (PLAN K13): /01/{gtin}/10/{batch}, GS1 Digital Link, no account. Rendered on the
 * server for every request (the language and today's date matter), from data that is cached until the next publishing
 * or withdrawal (lib/passport/load.ts), so a scan does not wait for the backend. The language: ?lang=, else the browser's
 * Accept-Language, else Turkish (proxy.ts; the panel's saved language does not apply to a shared page).
 *
 * Not found, withdrawn and "preparing" are drawn in place with this route's own status 200: Next cannot answer 404 or
 * 410 with a page of our own that still knows the scanned code.
 */

const SITE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://kozapass.vercel.app";

function siteHost(): string {
  try {
    return new URL(SITE).host;
  } catch {
    return "kozapass.vercel.app";
  }
}

/** Today in Istanbul as an ISO day: certificates are valid through their last day, on Turkish time. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

type Lookup = { kind: "found"; loaded: LoadedPassport } | { kind: "notfound" } | { kind: "preparing" };

/** Once per request: the metadata and the page ask for the same code and must not call the backend twice. */
const lookup = cache(async (gtin: string, batchNo: string): Promise<Lookup> => {
  try {
    return { kind: "found", loaded: await loadPassport(gtin, batchNo) };
  } catch (error) {
    return error instanceof PassportNotFound ? { kind: "notfound" } : { kind: "preparing" };
  }
});

export async function generateMetadata({ params }: PageProps<"/01/[gtin]/10/[batch]">): Promise<Metadata> {
  const { gtin, batch } = await params;
  const t = await getTranslations("passport");
  const key = parseDigitalLink(gtin, batch);
  const found = key ? await lookup(key.gtin, key.batchNo) : undefined;
  const noindex = { robots: { index: false, follow: false } };
  if (found?.kind === "found" && found.loaded.kind === "published") {
    const { product, manufacturer, passport } = found.loaded.passport.snapshot;
    return {
      title: `${product.name} · ${passport.batchNo}`,
      description: t("metaDescription", { product: product.name, maker: manufacturer.name }),
      ...noindex,
    };
  }
  return { title: t("dpp"), ...noindex };
}

export default async function Page({ params, searchParams }: PageProps<"/01/[gtin]/10/[batch]">) {
  const { gtin, batch } = await params;
  const { lang } = await searchParams;
  const t = await getTranslations("passport");
  const locale = await getLocale();

  const key = parseDigitalLink(gtin, batch);
  if (!key) {
    return (
      <PassportFrame footerHost={siteHost()}>
        <PassportMissing kind="notfound" gtin={gtin} lot={batch} />
      </PassportFrame>
    );
  }
  // One address per passport: GTIN-13 and lower-case spellings go to the canonical one (308), keeping ?lang=.
  if (key.gtin !== gtin || key.batchNo !== batch) {
    permanentRedirect(`/01/${key.gtin}/10/${key.batchNo}${typeof lang === "string" ? `?lang=${encodeURIComponent(lang)}` : ""}`);
  }

  const found = await lookup(key.gtin, key.batchNo);
  if (found.kind === "preparing") {
    return (
      <PassportFrame footerHost={siteHost()}>
        <PassportPreparing />
      </PassportFrame>
    );
  }
  if (found.kind === "notfound") {
    return (
      <PassportFrame footerHost={siteHost()}>
        <PassportMissing kind="notfound" gtin={key.gtin} lot={key.batchNo} />
      </PassportFrame>
    );
  }
  if (found.loaded.kind === "withdrawn") {
    const date = found.loaded.withdrawnAt
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(
          new Date(found.loaded.withdrawnAt),
        )
      : "—";
    return (
      <PassportFrame
        footerHost={siteHost()}
        banner={{ tone: "rejected", title: t("bannerWithdrawnTitle"), body: t("bannerWithdrawnBody", { date }) }}
      >
        <PassportMissing kind="withdrawn" gtin={key.gtin} lot={key.batchNo} />
      </PassportFrame>
    );
  }

  const { snapshot, verificationCode } = found.loaded.passport;
  const published = snapshot.passport.publishedAt
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(
        new Date(snapshot.passport.publishedAt),
      )
    : "—";
  return (
    <PassportFrame
      footerHost={siteHost()}
      banner={{
        tone: "approved",
        title: t("bannerCurrentTitle", { version: snapshot.passport.version }),
        body: t("bannerCurrentBody", { date: published }),
      }}
    >
      <PassportView snapshot={snapshot} mode="published" verificationCode={verificationCode} today={today()} host={siteHost()} />
    </PassportFrame>
  );
}
