import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Slide-over panel (left panel on phones). */
export function Sheet({ open, onOpenChange, title, side = "left", children, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; side?: "left" | "right"; children: React.ReactNode; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[86vw] max-w-sm flex-col border-border bg-card shadow-xl outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            side === "left" ? "left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left" : "right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Close className="absolute right-2 top-2 z-10 flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
