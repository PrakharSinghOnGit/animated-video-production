import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px]",
  {
    variants: {
      variant: {
        /** the one primary action on a surface */
        default: "bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100 disabled:ring-1 disabled:ring-inset disabled:ring-border",
        secondary: "border border-border-strong bg-raised text-foreground shadow-sm hover:bg-accent hover:border-input",
        outline: "border border-border-strong bg-transparent hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "border border-destructive/35 bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-8 px-3 max-md:h-10",
        sm: "h-7 px-2.5 text-xs max-md:h-10 max-md:px-3",
        icon: "size-8 max-md:size-10",
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
