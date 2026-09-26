"use client";

import { useSyncExternalStore } from "react";

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. */
export function shortcutLabelFor(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "⌘K" : "Ctrl K";
}

function currentPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform ?? navigator.platform ?? "";
}

const noSubscription = () => () => {};

/** Search shortcut label for this device; null during server render (shown after hydration). */
export function useSearchShortcutLabel(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => shortcutLabelFor(currentPlatform()),
    () => null,
  );
}
