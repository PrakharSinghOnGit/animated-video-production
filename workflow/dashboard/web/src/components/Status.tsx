import { Badge } from "@/components/ui/badge";
import { cn, STATUS_LABEL } from "@/lib/utils";

const DOT: Record<string, string> = {
  done: "bg-success border-success",
  stale: "border-warning bg-transparent",
  partial: "border-warning bg-[linear-gradient(90deg,var(--warning)_50%,transparent_50%)]",
  running: "bg-warning border-warning pulse",
  failed: "bg-destructive border-destructive",
  none: "border-muted-foreground/50",
};

export function StatusDot({ s, className }: { s: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full border-[1.5px]", DOT[s] ?? DOT.none, className)} />;
}

const TONE = { done: "success", running: "warning", partial: "warning", stale: "warning", failed: "danger", none: "neutral" } as const;

export function StatusPill({ s, text }: { s: string; text?: string }) {
  return (
    <Badge tone={TONE[s as keyof typeof TONE] ?? "neutral"}>
      <StatusDot s={s} />
      {text ?? STATUS_LABEL[s] ?? s}
    </Badge>
  );
}
