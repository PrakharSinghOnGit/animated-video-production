import * as React from "react";
import { Collapsible as C } from "radix-ui";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled section that folds. Content stays mounted only while open. */
export function Fold({ title, right, defaultOpen = false, open, onOpenChange, children, className, trigger }: {
  title: React.ReactNode; right?: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode; className?: string; trigger?: string;
}) {
  return (
    <C.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className={className}>
      <div className="flex items-center">
        <C.Trigger className={cn("group flex min-h-10 flex-1 items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground", trigger)}>
          <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
          {title}
        </C.Trigger>
        {right}
      </div>
      <C.Content>{children}</C.Content>
    </C.Root>
  );
}
