import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, matchAcceptLanguage } from "./locales";

// Order: ?lang= (via proxy header) -> remembered cookie -> Accept-Language -> tr
export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  const fromQuery = requestHeaders.get(LOCALE_HEADER);
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;

  const locale =
    (isLocale(fromQuery) && fromQuery) ||
    (isLocale(fromCookie) && fromCookie) ||
    matchAcceptLanguage(requestHeaders.get("accept-language")) ||
    defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
