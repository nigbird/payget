import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-linear-to-r from-[#f8b513] to-[#754319] text-white shadow-lg shadow-amber-600/25 hover:opacity-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

/**
 * Background-image classes passed to a default-variant Button never showed
 * under Tailwind 3: tailwind-merge didn't recognise v3's `bg-gradient-to-r`, so
 * both classes stayed and the variant's gradient won on CSS order. Under v4
 * tailwind-merge does recognise the conflict and the className would win,
 * restyling ~50 buttons. Dropping them keeps buttons exactly as they look today.
 * Variant-prefixed backgrounds (hover:, data-[..]:) applied under v3 and are kept.
 */
const UNPREFIXED_BG_IMAGE = /^(?:bg-\[(?:linear|radial|conic|url)|bg-(?:linear|radial|conic)-|bg-gradient-|bg-none$)/

function withoutBackgroundImage(className?: string) {
  if (!className) return className
  return className
    .split(/\s+/)
    .filter((token) => !UNPREFIXED_BG_IMAGE.test(token))
    .join(" ")
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const effectiveClassName = (variant ?? "default") === "default" ? withoutBackgroundImage(className) : className
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className: effectiveClassName }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
