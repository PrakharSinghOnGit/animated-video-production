import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Scissors, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/layout";
import { useApp } from "@/hooks/app";
import type { PieceAct, PieceCut, Pieces } from "@/lib/types";
import { cn } from "@/lib/utils";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const CUT_TONE: Record<PieceCut["mark"], string> = { fine: "bg-success", bad: "bg-destructive", stale: "bg-warning", none: "bg-muted-foreground/60" };
const CUT_WORD: Record<PieceCut["mark"], string> = { fine: "marked fine", bad: "marked not fine", stale: "marked before the acts changed", none: "not watched yet" };

/**
 * Render → the video as act pieces (05-video/chunks): one segment per act on a timeline (green = rendered for the
 * current state, amber = out of date, empty = not rendered), a marker at every cut with its transition and your seam
 * mark, and a player that plays the pieces back to back with the sound mix, so nothing has to be joined to watch it.
 */
export function ActTimeline({ p }: { p: Pieces }) {
  const { d, file, run, canRun, jobFor } = useApp();
  const [scale, setScale] = useState<"1" | "0.5" | "0.25">("1");
  const q = p.qualities.find((x) => x.scale === scale) ?? p.qualities[0];
  const acts = q.acts;
  const ready = acts.filter((a) => a.fresh).length, old = acts.filter((a) => a.exists && !a.fresh).length;
  const mixRel = d?.sound.files.find((f) => f.path.endsWith("06-audio/mix.wav"))?.path ?? d?.align.master?.path ?? null;
  const running = !!jobFor("Render acts") || !!jobFor("Stitch draft");
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {p.qualities.length > 1 && <Segmented label="Quality" value={scale} onChange={setScale} options={p.qualities.map((x) => ({ value: x.scale, label: x.scale === "1" ? "Full" : `${x.scale}×` }))} />}
        <Badge tone="success">{ready} ready</Badge>
        {old > 0 && <Badge tone="warning">{old} out of date</Badge>}
        {acts.length - ready - old > 0 && <Badge>{acts.length - ready - old} not rendered</Badge>}
        <span className="text-muted-foreground">{acts.length} acts · {clock(p.total / p.fps)}</span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant={ready < acts.length ? "default" : "outline"} disabled={running || ready === acts.length || !canRun("render.acts")} onClick={() => void run("render.acts", undefined, { scale })}
            title="Renders only the acts that are out of date or missing, then stops (no joining)">
            {ready === acts.length ? "All acts rendered" : `Render ${acts.length - ready} act${acts.length - ready === 1 ? "" : "s"}`}
          </Button>
          <Button size="sm" variant="outline" disabled={running || !canRun("render.draft")} onClick={() => void run("render.draft", undefined, { scale })}
            title="Joins the pieces into one draft.mp4 with the sound, then QC (renders any act still out of date first)">
            <Scissors />Stitch
          </Button>
        </span>
      </div>
      <Player acts={acts} cuts={p.cuts} fps={p.fps} total={p.total} url={(a) => `${file(a.rel)}&v=${Math.round(a.mtime)}`} mix={mixRel ? file(mixRel) : null} />
    </div>
  );
}

function Player({ acts, cuts, fps, total, url, mix }: { acts: PieceAct[]; cuts: PieceCut[]; fps: number; total: number; url: (a: PieceAct) => string; mix: string | null }) {
  // two stacked <video>s: one plays, the other has the next piece loaded, so the switch at a cut is instant
  const vids = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const audio = useRef<HTMLAudioElement>(null);
  const [slot, setSlot] = useState(0);
  const [idx, setIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const loaded = useRef<[number, number]>([-1, -1]);   // which act each slot holds
  const playable = useMemo(() => acts.map((a) => a.exists), [acts]);
  const nextPlayable = (i: number) => { for (let j = i; j < acts.length; j++) if (playable[j]) return j; return -1; };

  const srcs = useRef(["", ""]);
  const load = (s: number, i: number, at = 0) => {
    const v = vids[s].current; if (!v || i < 0) return;
    const u = url(acts[i]);
    if (srcs.current[s] !== u) { v.src = u; srcs.current[s] = u; }
    loaded.current[s] = i;
    v.currentTime = at;
  };
  const syncAudio = (g: number, force = false) => {
    const a = audio.current; if (!a) return;
    if (force || Math.abs(a.currentTime - g) > 0.2) a.currentTime = g;
  };
  /** Jump to a frame of the whole video. */
  const seek = (f: number) => {
    let i = acts.findIndex((a) => f >= a.from && f < a.to);
    if (i < 0) i = acts.length - 1;
    const j = nextPlayable(i);
    if (j < 0) return;
    const at = j === i ? (f - acts[i].from) / fps : 0;
    load(slot, j, at); setIdx(j); setFrame(acts[j].from + at * fps);
    load(1 - slot, nextPlayable(j + 1));
    syncAudio(acts[j].from / fps + at, true);
    if (playing) { void vids[slot].current?.play(); void audio.current?.play(); }
  };
  useEffect(() => { seek(0); }, [acts.map((a) => `${a.id}${a.mtime}`).join()]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const v = vids[slot].current; if (!v) return;
    if (playing) { v.pause(); audio.current?.pause(); setPlaying(false); return; }
    syncAudio(acts[idx].from / fps + v.currentTime, true);
    void v.play(); void audio.current?.play(); setPlaying(true);
  };
  const onTime = (s: number) => {
    if (s !== slot) return;
    const v = vids[s].current; if (!v) return;
    const g = acts[idx].from / fps + v.currentTime;
    setFrame(g * fps);
    if (playing) syncAudio(g);
  };
  const onEnded = (s: number) => {
    if (s !== slot) return;
    const j = nextPlayable(idx + 1);
    if (j < 0) { setPlaying(false); audio.current?.pause(); return; }
    const o = 1 - slot;
    if (loaded.current[o] !== j) load(o, j);
    vids[o].current!.currentTime = 0;
    void vids[o].current?.play();
    if (j !== idx + 1) syncAudio(acts[j].from / fps, true);   // skipped an act that is not rendered
    setSlot(o); setIdx(j);
    setTimeout(() => load(s, nextPlayable(j + 1)), 50);
  };

  const cur = acts[idx];
  const pct = (f: number) => `${(100 * f) / total}%`;
  return (
    <div className="grid gap-2">
      <div className="relative mx-auto aspect-video w-full max-w-[960px] overflow-hidden rounded-md bg-black">
        {[0, 1].map((s) => (
          <video key={s} ref={vids[s]} muted playsInline preload="auto" onClick={toggle}
            className={cn("absolute inset-0 size-full", s === slot ? "visible" : "invisible")}
            onTimeUpdate={() => onTime(s)} onEnded={() => onEnded(s)} />
        ))}
        {cur && !cur.fresh && <span className="absolute left-2 top-2 rounded bg-warning/90 px-1.5 py-0.5 text-[11px] font-medium text-black">{cur.id}: {cur.exists ? "out of date (an older render)" : "not rendered"}</span>}
        {mix && <audio ref={audio} src={mix} preload="auto" />}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => seek(acts[Math.max(0, idx - 1)].from)} title="Previous act"><SkipBack /></Button>
        <Button size="icon" variant="outline" className="size-7" onClick={toggle} title={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => seek(acts[Math.min(acts.length - 1, idx + 1)].from)} title="Next act"><SkipForward /></Button>
        <span className="font-mono tabular-nums text-muted-foreground">{clock(frame / fps)} / {clock(total / fps)}</span>
        {cur && <span className="truncate text-muted-foreground"><b className="text-foreground">{cur.id}</b> {cur.slug}</span>}
        {!mix && <span className="ml-auto text-subtle-foreground">no sound mix yet (Sound step)</span>}
      </div>
      {/* the timeline: one segment per act, a marker per cut, the playhead */}
      <div className="relative h-11 select-none" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(Math.floor(((e.clientX - r.left) / r.width) * total)); }}>
        <div className="absolute inset-x-0 top-1 flex h-8 gap-px overflow-hidden rounded">
          {acts.map((a) => (
            <div key={a.id} style={{ width: pct(a.to - a.from) }} title={`${a.id} ${a.slug} · ${clock(a.from / fps)}–${clock(a.to / fps)} · ${a.fresh ? "rendered" : a.exists ? "out of date: renders again" : "not rendered"}${a.renderMs ? ` · last render ${Math.round(a.renderMs / 1000)} s` : ""}`}
              className={cn("flex min-w-0 items-center px-1.5 text-[10.5px] font-medium",
                a.fresh ? "bg-success/25 text-foreground" : a.exists ? "bg-warning/25 text-foreground [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.08)_6px_12px)]" : "border border-dashed border-border bg-muted/40 text-muted-foreground",
                a === cur && "ring-2 ring-inset ring-brand")}>
              <span className="truncate">{a.id}<span className="font-normal text-muted-foreground"> {a.slug}</span></span>
            </div>
          ))}
        </div>
        {cuts.map((c) => (
          <button key={`${c.a}-${c.b}`} type="button" style={{ left: pct(c.frame) }}
            onClick={(e) => { e.stopPropagation(); seek(Math.max(0, c.frame - fps * 1.5)); }}
            title={`${c.a} → ${c.b}: ${c.kind}${c.how ? ` (${c.how})` : ""} · ${CUT_WORD[c.mark]}${c.note ? `: ${c.note}` : ""}${c.flag && c.flag !== "ok" ? ` · check: ${c.flag}` : ""}. Click: play from just before the cut`}
            className="absolute top-0 z-10 flex h-10 -translate-x-1/2 flex-col items-center">
            <span className={cn("mt-px size-2.5 rotate-45 rounded-[2px] ring-2 ring-background", CUT_TONE[c.mark])} />
            <span className="w-px flex-1 bg-foreground/40" />
            <span className="rounded bg-background/90 px-1 text-[9px] leading-tight text-muted-foreground">{c.kind}</span>
          </button>
        ))}
        <div className="pointer-events-none absolute top-0 z-20 h-10 w-0.5 bg-brand" style={{ left: pct(frame) }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-subtle-foreground">
        <span><i className="mr-1 inline-block size-2 rounded-sm bg-success/60" />rendered</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm bg-warning/60" />out of date</span>
        <span><i className="mr-1 inline-block size-2 rounded-sm border border-dashed border-border" />not rendered</span>
        <span className="ml-2">cut marks:</span>
        {(["fine", "bad", "none"] as const).map((m) => <span key={m}><i className={cn("mr-1 inline-block size-2 rotate-45 rounded-[1px]", CUT_TONE[m])} />{CUT_WORD[m]}</span>)}
      </div>
    </div>
  );
}
