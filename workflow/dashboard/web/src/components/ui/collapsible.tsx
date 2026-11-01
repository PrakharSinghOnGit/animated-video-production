import * as React from "react";
import { Collapsible as C } from "radix-ui";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** A titled section that folds (animated height). Content stays mounted only while open. */
export function Fold({ title, right, defaultOpen = false, open, onOpenChange, children, className, trigger }: {
  title: React.ReactNode; right?: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode; className?: string; trigger?: string;
}) {
  return (
    <C.Root defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange} className={className}>
      <div className="flex items-center">
        <C.Trigger className={cn("group flex min-h-9 flex-1 items-center gap-1.5 rounded-sm text-left text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground max-md:min-h-11", trigger)}>
          <ChevronRight className="size-3.5 text-subtle-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
          {title}
        </C.Trigger>
        {right}
      </div>
      <C.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">{children}</C.Content>
    </C.Root>
  );
}
