import { cn } from "cn";
import type * as React from "react";

/* Design v0.3 sheet textarea: same border, surface, shadow and focus ring as Input; 8/10 px padding. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full resize-y rounded-md border border-input bg-card px-2.5 py-2 text-[13px] leading-normal text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-rejected aria-invalid:ring-[3px] aria-invalid:ring-status-rejected-muted aria-invalid:focus-visible:border-status-rejected aria-invalid:focus-visible:ring-status-rejected-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
