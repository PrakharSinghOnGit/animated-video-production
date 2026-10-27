import { cn } from "@/lib/utils";

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "success" | "warning" | "danger" }) {
  const c = { brand: "bg-brand", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }[tone];
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} className={cn("h-1.5 overflow-hidden rounded-full bg-secondary", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
