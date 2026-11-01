import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <T.Provider delayDuration={200} skipDelayDuration={300}>{children}</T.Provider>;

const content = "z-[70] max-w-[300px] rounded-md border border-border-strong bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-md data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0";

/** Wraps a child with a hover/focus tooltip. */
export function Tip({ label, children, side = "bottom", className }: { label: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} collisionPadding={8} className={cn(content, className)}>{label}</T.Content>
      </T.Portal>
    </T.Root>
  );
}

/** The (i) next to a heading: secondary explanation lives here instead of under the heading. */
export function InfoTip({ children, side = "bottom", label = "More information", className }: { children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; label?: string; className?: string }) {
  return (
    <T.Root>
      <T.Trigger asChild>
        <button type="button" aria-label={label} className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-subtle-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60", className)}>
          <Info className="size-3.5" />
        </button>
      </T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} collisionPadding={8} className={cn(content, "max-w-[340px] px-3 py-2")}>{children}</T.Content>
      </T.Portal>
    </T.Root>
  );
}
