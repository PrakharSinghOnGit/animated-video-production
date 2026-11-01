import { cn } from "@/lib/utils";

/** A number with its caption. Fixed min width so values changing while polling do not shift neighbours. */
export function StatTile({ value, label, className, align = "right" }: { value: React.ReactNode; label: string; className?: string; align?: "left" | "right" }) {
  return (
    <div className={cn("min-w-14", align === "right" ? "text-right" : "text-left", className)}>
      <div className="text-[15px] font-semibold leading-tight tracking-[-0.015em] tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
