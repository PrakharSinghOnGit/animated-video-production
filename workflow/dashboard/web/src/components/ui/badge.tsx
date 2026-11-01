import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[5px] px-1.5 text-[11px] font-medium leading-none tracking-[0.005em]", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
      success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
      warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/25",
      danger: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/25",
      info: "bg-info/10 text-info ring-1 ring-inset ring-info/25",
      solid: "bg-brand text-brand-foreground font-semibold",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
