import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/*
 * Design E "Input": 1px --input border, --card surface, shadow-xs, radius md; focus ring 3px / 18 %.
 * Invalid (design v0.3 03/04): --status-rejected border with a 3px --status-rejected-muted ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-rejected aria-invalid:ring-[3px] aria-invalid:ring-status-rejected-muted",
        className
      )}
      {...props}
    />
  )
}

export { Input }
