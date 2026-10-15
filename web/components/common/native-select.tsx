"use client";

import { ChevronDown } from "lucide-react";

/** The design's selects are native: chevron on the right, same border and surface as inputs. */
export function NativeSelect({
  compact,
  className = "",
  children,
  ...props
}: React.ComponentProps<"select"> & { compact?: boolean }) {
  return (
    <span className="relative flex items-center">
      <select
        className={`flex-1 cursor-pointer appearance-none rounded-md border border-input bg-card pr-[30px] pl-2.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
          compact ? "h-[34px]" : "h-9 shadow-xs"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute size-4 text-muted-foreground ${compact ? "right-2" : "right-2.5"}`}
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
}
