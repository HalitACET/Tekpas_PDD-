import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_HEADER, matchAcceptLanguage } from "./i18n/locales";

/**
 * Carries a valid `?lang=` into the render and remembers it in a cookie. The passport page (/01/…) is a shared document
 * for everyone with the code: its language is ?lang=, else Accept-Language, else Turkish, always decided here, so the
 * panel's saved language never changes it and a visitor's choice leaves no cookie behind.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/01/")) {
    const asked = request.nextUrl.searchParams.get("lang");
    const language = isLocale(asked) ? asked : (matchAcceptLanguage(request.headers.get("accept-language")) ?? defaultLocale);
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, language);
    return NextResponse.next({ request: { headers } });
  }
  const lang = request.nextUrl.searchParams.get("lang");
  if (!isLocale(lang)) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, lang);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LOCALE_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

export const config = {
  // "\\." is a literal dot in the pattern ("\." in a string literal would be just "." and exclude every path).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
