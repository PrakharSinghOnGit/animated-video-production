import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border border-input bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-input bg-transparent hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-9 px-3.5 max-md:h-10",
        sm: "h-8 px-2.5 text-xs max-md:h-10 max-md:px-3",
        icon: "size-9 max-md:size-10",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type Props = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: Props) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
