import { cn } from "@/lib/utils";

/** A number with its caption. Fixed min width so values changing while polling do not shift neighbours. */
export function StatTile({ value, label, className, align = "right" }: { value: React.ReactNode; label: string; className?: string; align?: "left" | "right" }) {
  return (
    <div className={cn("min-w-14", align === "right" ? "text-right" : "text-left", className)}>
      <b className="block text-[15px] font-semibold leading-tight">{value}</b>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
