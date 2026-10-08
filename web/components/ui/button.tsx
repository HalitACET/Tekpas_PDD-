import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * Design E (Bileşenler) "Buton": primary, secondary, ghost, destructive and brand (single high-stakes
 * actions such as publishing). Sizes sm 32, default 36, lg 40, xl 48 (mobile login). Keyboard focus:
 * --ring at 3px / 18 %.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:pointer-events-none disabled:opacity-45 data-disabled:cursor-not-allowed data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border-input bg-card text-foreground shadow-xs hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        default: "h-9 px-3.5 text-[13px]",
        lg: "h-10 px-4 text-sm",
        xl: "h-12 rounded-lg px-5 text-base",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
