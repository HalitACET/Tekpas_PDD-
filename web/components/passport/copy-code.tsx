"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/** "Kopyala" next to the verification code (design v0.6): 44 px tall, says "Kopyalandı" for two seconds. */
export function CopyCode({ code, copyLabel, copiedLabel }: { code: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(code).then(
          () => setCopied(true),
          () => {},
        );
      }}
      className="-my-2.5 flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-brand-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
    >
      {copied ? <Check className="size-[15px]" strokeWidth={1.75} aria-hidden /> : <Copy className="size-[15px]" strokeWidth={1.75} aria-hidden />}
      <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
    </button>
  );
}
