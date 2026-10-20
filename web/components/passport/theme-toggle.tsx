"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Light and dark follow the OS; this pins one of them (design v0.6: the moon button in the page header, 44 px). */
export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; until then the moon is drawn (the server cannot tell).
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="-mr-2.5 flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft"
    >
      {dark ? <Sun className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <Moon className="size-[18px]" strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
