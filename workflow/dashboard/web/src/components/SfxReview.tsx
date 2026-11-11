import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import type { SfxEdits, SfxInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionCard } from "@/components/ActionCard";
import { DataTable, Td } from "@/components/DataTable";
import { Note } from "@/components/FileLine";
import { RunButton } from "@/components/RunButton";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/fields";

const GAIN_MIN = -24, GAIN_MAX = 6;
const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
type Save = "saved" | "dirty" | "saving" | "error";

/**
 * The foley of a video (short = null) or of one short: every event the acts declare (05-video/events_all.json), with a clip to
 * play, a remove/restore toggle and a gain. Edits are saved to 05-video/sfx_edits.json as you make them; Apply re-reads them
 * (cues, mix, new draft). The draft player on the side can jump to an event's time.
 */
export function SfxReview({ short }: { short?: string | null }) {
  const { ws, d, busy, file, toast } = useApp();
  const runSaved = useRunSaved();
  const [info, setInfo] = useState<SfxInfo | null>(null);
  const [err, setErr] = useState("");
  const [edits, setEdits] = useState<SfxEdits>({ off: [], gainDb: {} });
  const [save, setSave] = useState<Save>("saved");
  const [actFilter, setActFilter] = useState(""), [typeFilter, setTypeFilter] = useState(""), [view, setView] = useState<"all" | "off" | "changed">("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null), video = useRef<HTMLVideoElement>(null);
  const dirty = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null), latest = useRef(edits);
  const prefix = short ? `shorts/${short}/` : "";
  const applyKey = short ? "shorts.sound.apply" : "sound.apply", clipsKey = short ? "sfx.clips.short" : "sfx.clips";
  const applyLabel = short ? `Apply SFX edits ${short}` : "Apply SFX edits", clipsLabel = short ? `Build clip previews ${short}` : "Build clip previews";

  const load = useCallback(async () => {
    if (!ws) return;
    try {
      const r = await api.sfx(ws, short);
      setInfo(r); setErr("");
      if (!dirty.current) { setEdits(r.edits); latest.current = r.edits; }
    } catch (e) { setErr((e as Error).message); }
  }, [ws, short]);
  // reload on mount and whenever a job ends (cues, clip previews or the apply wrote new files)
  const runs = d?.runs.length ?? 0;
  useEffect(() => { void load(); }, [load, runs]);

  const flush = useCallback(async () => {
    if (!ws || !dirty.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setSave("saving");
    try { await api.saveSfx(ws, short, latest.current); dirty.current = false; setSave("saved"); }
    catch (e) { setSave("error"); toast((e as Error).message); throw e; }
  }, [ws, short, toast]);
  useEffect(() => () => { if (timer.current && dirty.current && ws) void api.saveSfx(ws, short, latest.current).catch(() => {}); }, [ws, short]);

  const edit = (fn: (e: SfxEdits) => SfxEdits) => {
    const n = fn(latest.current);
    latest.current = n; setEdits(n); dirty.current = true; setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 600);
  };
  const off = useMemo(() => new Set(edits.off), [edits.off]);
  const toggle = (k: string) => edit((e) => ({ ...e, off: e.off.includes(k) ? e.off.filter((x) => x !== k) : [...e.off, k] }));
  const setGain = (k: string, v: number) => edit((e) => { const g = { ...e.gainDb }; if (v === 0) delete g[k]; else g[k] = v; return { ...e, gainDb: g }; });

  const clip = useMemo(() => new Map((info?.clips ?? []).map((c) => [c.key, c])), [info?.clips]);
  const events = useMemo(() => [...(info?.events ?? [])].sort((a, b) => a.t - b.t), [info?.events]);
  const acts = useMemo(() => [...new Set(events.map((e) => e.act))], [events]);
  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const shown = events.filter((e) => (!actFilter || e.act === actFilter) && (!typeFilter || e.type === typeFilter)
    && (view === "all" || (view === "off" ? off.has(e.key) : off.has(e.key) || (edits.gainDb[e.key] ?? 0) !== 0)));
  const nOff = events.filter((e) => off.has(e.key)).length, nGain = events.filter((e) => (edits.gainDb[e.key] ?? 0) !== 0).length;

  const play = (key: string) => {
    const a = audio.current, c = clip.get(key);
    if (!a || !c) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.src = file(`${prefix}06-audio/sfx_clips/${c.file}`);
    // the element cannot go above 1.0: a boost is previewed at full level
    a.volume = Math.min(1, 10 ** ((edits.gainDb[key] ?? 0) / 20));
    setPlaying(key);
    void a.play().catch(() => setPlaying(null));
  };
  const seek = (t: number) => { const v = video.current; if (!v) return; v.currentTime = Math.max(0, t - 0.4); void v.play().catch(() => {}); v.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

  if (!ws) return null;
  if (err) return <Note tone="danger">{err}</Note>;
  if (!info) return <div className="text-xs text-muted-foreground">Loading…</div>;

  const applying = busy?.label === applyLabel, building = busy?.label === clipsLabel;
  const draft = info.draft;
  const apply = async () => { try { await flush(); runSaved(applyKey, short ?? undefined); } catch { /* flush already told the user */ } };
  const portrait = !!short;

  if (!info.events) {
    return (
      <Note>
        The foley events are not listed yet (<code>{prefix}05-video/events_all.json</code>): run <b>Cues</b>{short ? " (the Sound stage above)" : ""} to write them from the acts.
      </Note>
    );
  }
  return (
    <div className="grid gap-3">
      <audio ref={audio} onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} preload="none" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span><b className="text-foreground">{events.length}</b> events · <b className={cn(nOff ? "text-warning" : "text-foreground")}>{nOff}</b> removed · <b className="text-foreground">{nGain}</b> with a level change</span>
        <span className={cn(save === "error" && "text-destructive", save === "dirty" && "text-warning")}>{save === "saved" ? "edits saved" : save === "saving" ? "saving…" : save === "dirty" ? "unsaved…" : "save failed"}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Act" className="h-8 w-28" value={actFilter} onChange={(e) => setActFilter(e.target.value)}><option value="">all acts</option>{acts.map((a) => <option key={a}>{a}</option>)}</NativeSelect>
          <NativeSelect aria-label="Type" className="h-8 w-32" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">all types</option>{types.map((a) => <option key={a}>{a}</option>)}</NativeSelect>
          <NativeSelect aria-label="Show" className="h-8 w-32" value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="all">all events</option><option value="off">removed only</option><option value="changed">edited only</option></NativeSelect>
        </span>
      </div>

      {(!info.clips || (info.clipsMissing ?? 0) > 0) && (
        <Note>
          {!info.clips ? "Clip previews are not built yet: the play buttons need them." : `${info.clipsMissing} event${info.clipsMissing === 1 ? " has" : "s have"} no clip preview yet (the cues changed).`}
          <div className="mt-2"><RunButton label="Build clip previews" running={building} disabled={!!busy} onClick={() => runSaved(clipsKey, short ?? undefined)} /></div>
        </Note>
      )}

      <div className={cn("grid items-start gap-3", portrait ? "@4xl:grid-cols-[minmax(0,1fr)_240px]" : "@4xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="min-w-0 rounded-lg border">
          <DataTable maxH="460px" head={[{ label: "On" }, { label: "Time" }, { label: "Act" }, { label: "Type" }, { label: "Clip" }, { label: `Gain (${GAIN_MIN}…+${GAIN_MAX} dB)` }, { label: "Seek" }]}>
            {shown.map((e) => {
              const isOff = off.has(e.key), g = edits.gainDb[e.key] ?? 0, c = clip.get(e.key);
              return (
                <tr key={e.key} className={cn(isOff && "opacity-50")}>
                  <Td>
                    <Button size="sm" variant={isOff ? "outline" : "ghost"} className="w-24 justify-start" onClick={() => toggle(e.key)} aria-pressed={isOff} title={isOff ? "Put this event back" : "Remove this event from the mix"}>
                      {isOff ? <><RotateCcw />Restore</> : <><Trash2 />Remove</>}
                    </Button>
                  </Td>
                  <Td className="whitespace-nowrap font-mono">{fmtT(e.t)}</Td>
                  <Td className="font-mono">{e.act}</Td>
                  <Td>{e.type}</Td>
                  <Td>
                    <Button size="icon" variant="ghost" className="size-8" disabled={!c} onClick={() => play(e.key)} aria-label={`${playing === e.key ? "Stop" : "Play"} ${e.type} at ${fmtT(e.t)}`} title={c ? "Play this event's clip" : "No clip preview yet"}>
                      {playing === e.key ? <Square className="fill-current" /> : <Play className="fill-current" />}
                    </Button>
                  </Td>
                  <Td>
                    <div className="flex min-w-44 items-center gap-2">
                      <input type="range" min={GAIN_MIN} max={GAIN_MAX} step={1} value={g} onChange={(ev) => setGain(e.key, Number(ev.target.value))} aria-label={`Gain of ${e.type} at ${fmtT(e.t)}`} className="h-1.5 min-w-24 flex-1 accent-[var(--brand)]" />
                      <button className={cn("w-14 text-right font-mono text-[11.5px] hover:underline", g !== 0 ? "text-foreground" : "text-muted-foreground")} onClick={() => setGain(e.key, 0)} title="Reset to 0 dB">{g > 0 ? "+" : ""}{g} dB</button>
                    </div>
                  </Td>
                  <Td>
                    <Button size="icon" variant="ghost" className="size-8" disabled={!draft} onClick={() => seek(e.t)} aria-label={`Seek the draft to ${fmtT(e.t)}`} title={draft ? "Jump the draft player to this event" : "No draft video yet"}><Crosshair /></Button>
                  </Td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><Td colSpan={7} className="text-muted-foreground">No events match.</Td></tr>}
          </DataTable>
        </div>
        <div className="grid gap-1.5">
          {draft ? (
            <video ref={video} controls preload="metadata" src={`${file(draft.path)}&v=${Math.round(draft.mtime)}`} className={cn("w-full rounded border bg-black object-contain", portrait ? "aspect-[9/16] max-h-[60dvh]" : "aspect-video")} />
          ) : <div className="rounded border p-3 text-xs text-muted-foreground">No draft video yet: Apply renders one.</div>}
          <div className="text-[11px] text-muted-foreground">Draft player: the crosshair on a row jumps here, 0.4 s before the event.</div>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border bg-secondary/30 p-3">
        <div className="text-xs text-muted-foreground">
          Apply re-reads the edits and runs {short ? <>the <b>sound</b> stage, then a new draft</> : <>cues, the mix and a new draft</>}. Music: {short ? "tick “No music bed” to drop it" : "tick “Include music” to mix the bed in"}.
        </div>
        <ActionCard bare id={applyKey} act={short ?? undefined} />
        <div className="flex items-center gap-2.5 px-3">
          <Button variant="default" disabled={!!busy || save === "saving"} onClick={apply}>{applying ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />}{applying ? "Applying" : "Apply"}</Button>
          <span className="text-xs text-muted-foreground">{short ? "bun run shorts --step sound, then --step draft" : "cues → audio:mix → draft"}</span>
        </div>
      </div>
    </div>
  );
}
