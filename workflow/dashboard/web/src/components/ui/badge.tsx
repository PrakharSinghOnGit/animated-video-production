import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] leading-4", {
  variants: {
    tone: {
      neutral: "border-input text-muted-foreground",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-warning/35 bg-warning/10 text-warning",
      danger: "border-destructive/35 bg-destructive/10 text-destructive",
      info: "border-info/35 bg-info/10 text-info",
      solid: "border-transparent bg-brand text-background font-semibold",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
