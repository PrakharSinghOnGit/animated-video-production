import type { ShortRhythm } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/**
 * A short's music at a glance: every beat a tick, bars taller, big accents as dots (size = strength), loudness per beat as
 * a line, a time ruler in seconds. What the plan and the act author see as numbers.
 */
export function BeatMap({ r }: { r: ShortRhythm }) {
  const W = 1000, H = 92, top = 10, base = 66, dur = Math.max(1, r.dur);
  const x = (t: number) => (Math.max(0, Math.min(dur, t)) / dur) * W;
  const down = new Set(r.downbeats.map((t) => t.toFixed(3)));
  const energy = r.beats.map((t, i) => `${x(t).toFixed(1)},${(base - 4 - (r.energy[i] ?? 0) * 40).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.floor(dur / 5) + 1 }, (_, i) => i * 5);
  const conf = r.confidence >= 0.75 ? ["success", "steady beat"] : r.confidence >= 0.5 ? ["warning", "loose beat"] : ["danger", "irregular beat"];
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <b>{r.title}</b>
        <span className="text-muted-foreground">{r.bpm} BPM · from {r.start.toFixed(2)} s in the track · {r.beats.length} beats · {r.downbeats.length} bars · {r.accents.filter((a) => a.s >= 0.6).length} big accents</span>
        <Badge tone={conf[0] as "success"}>{conf[1]} ({r.confidence})</Badge>
        {r.license && <span className="text-[11px] text-subtle-foreground">licence: {r.license}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded border border-border bg-muted/30" role="img" aria-label={`Beat map: ${r.bpm} BPM over ${dur.toFixed(1)} seconds`}>
        <polyline points={energy} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} />
        {r.beats.map((t) => {
          const isDown = down.has(t.toFixed(3));
          return <line key={t} x1={x(t)} x2={x(t)} y1={isDown ? top : base - 22} y2={base} stroke={isDown ? "var(--color-brand, #e2571e)" : "currentColor"} strokeOpacity={isDown ? 0.95 : 0.35} strokeWidth={isDown ? 2 : 1} />;
        })}
        {r.accents.map((a) => <circle key={a.t} cx={x(a.t)} cy={top + 4} r={2 + a.s * 5} fill="var(--color-warning, #d99a00)" fillOpacity={0.35 + a.s * 0.6} />)}
        <line x1={0} x2={W} y1={base} y2={base} stroke="currentColor" strokeOpacity={0.3} />
        {ticks.map((t) => <text key={t} x={x(t) + 2} y={H - 8} fontSize={11} fill="currentColor" fillOpacity={0.55}>{t}s</text>)}
      </svg>
      <div className="text-[11px] text-subtle-foreground">tall orange = bar start (camera moves, new elements) · short ticks = beats (the pulse) · dots = big accents (thumps) · grey line = loudness</div>
    </div>
  );
}
