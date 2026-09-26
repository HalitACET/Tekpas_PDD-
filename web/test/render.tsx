import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import tr from "@/messages/tr.json";

/** Renders with the Turkish messages, as the app does by default. */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="tr" messages={tr} timeZone="Europe/Istanbul">
      {ui}
    </NextIntlClientProvider>,
  );
}
