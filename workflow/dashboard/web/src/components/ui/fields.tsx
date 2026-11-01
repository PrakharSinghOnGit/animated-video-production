import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const field = "w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50";

export const Input = ({ className, ...p }: React.ComponentProps<"input">) => <input className={cn(field, "h-8 max-md:h-10 max-md:text-base", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.ComponentProps<"textarea">) => (
  <textarea className={cn(field, "resize-y py-2 font-mono text-[12.5px] leading-relaxed max-md:text-[13px]", className)} {...p} />
);
export const NativeSelect = ({ className, ...p }: React.ComponentProps<"select">) => <select className={cn(field, "h-8 cursor-pointer pr-7 max-md:h-10 max-md:text-base", className)} {...p} />;

export function Checkbox({ className, ...p }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn("flex size-4.5 shrink-0 items-center justify-center rounded border border-input bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=checked]:text-background", className)} {...p}>
      <CheckboxPrimitive.Indicator><Check className="size-3.5" strokeWidth={3} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
