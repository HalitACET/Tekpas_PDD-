import { cn } from "cn"

/* Design E "Yükleniyor iskeleti": --skeleton + animate-pulse (1.6 s, see globals.css). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
