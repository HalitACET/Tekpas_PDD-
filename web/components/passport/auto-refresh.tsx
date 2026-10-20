"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** How often a page that could not load asks again, and for how long (a free-tier server wakes in about 1–2 minutes). */
const EVERY_MS = 6000;
const GIVE_UP_AFTER = 30;

/**
 * The "Pasaport hazırlanıyor" state (design v0.6, state b): the server component could not get the passport in time; this
 * asks the page again every few seconds without the person doing anything, and after about three minutes says so and
 * offers a button.
 */
export function AutoRefresh({ gaveUpText, retryLabel }: { gaveUpText: string; retryLabel: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const gaveUp = tries >= GIVE_UP_AFTER;

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, EVERY_MS);
    return () => clearTimeout(timer);
  }, [tries, gaveUp, router]);

  if (!gaveUp) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-story-border bg-card p-4 text-[15px]">
      <span className="min-w-0 flex-1">{gaveUpText}</span>
      <button
        type="button"
        onClick={() => {
          setTries(0);
          router.refresh();
        }}
        className="h-11 cursor-pointer rounded-lg border border-input px-4 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
      >
        {retryLabel}
      </button>
    </div>
  );
}
