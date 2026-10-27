import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <T.Provider delayDuration={250}>{children}</T.Provider>;

/** Wraps a child with a hover/focus tooltip. */
export function Tip({ label, children, side = "bottom" }: { label: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className={cn("z-[70] max-w-xs rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md")}>
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
