import { useApp } from "@/hooks/app";
import { useNow } from "@/hooks/useNow";
import { Progress } from "@/components/ui/progress";
import { ago } from "@/lib/utils";
import type { LimitWindow } from "@/lib/types";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h} h ${p(m)} min ${p(r)} s` : `${m} min ${p(r)} s`;
}

/** Ticks every second; only this leaf re-renders. */
export function Countdown({ resetsAt }: { resetsAt: number | null }) {
  const now = useNow(1000);
  if (resetsAt == null) return <span className="text-muted-foreground">reset time unknown</span>;
  const left = resetsAt * 1000 - now;
  if (left <= 0) return <span className="text-muted-foreground">reset, waiting for the next update</span>;
  return <span className="font-mono tabular-nums">resets in {fmt(left)}</span>;
}

const tone = (p: number) => (p >= 90 ? "danger" : p >= 70 ? "warning" : "success") as "danger" | "warning" | "success";

function Row({ label, w }: { label: string; w: LimitWindow }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><b className="text-[15px] font-semibold">{Math.round(w.used_percentage)}% used</b></div>
      <Progress value={w.used_percentage} tone={tone(w.used_percentage)} />
      <div className="text-[11.5px]"><Countdown resetsAt={w.resets_at} /></div>
    </div>
  );
}

/** Plan limits from Claude Code's status line (5-hour window, and the 7-day window when present). */
export function LimitsMeter() {
  const { limits } = useApp();
  if (!limits || (!limits.five_hour && !limits.seven_day)) {
    return <div className="text-xs text-muted-foreground">No limit data yet. It is written by the Claude Code status line while a session is open.</div>;
  }
  return (
    <div className="grid gap-3">
      {limits.five_hour && <Row label="5-hour window" w={limits.five_hour} />}
      {limits.seven_day && <Row label="7-day window" w={limits.seven_day} />}
      <div className="text-[11px] text-muted-foreground">as of {ago(limits.updatedAt)} · refreshes while a Claude Code session is open</div>
    </div>
  );
}
