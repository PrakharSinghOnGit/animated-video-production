import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { basename, cn, mb, ago } from "@/lib/utils";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import type { FileInfo } from "@/lib/types";

const SPEEDS = [0.5, 1, 1.5, 2, 3];

/** Playback speed chips; the choice is remembered for every player. */
function Speed({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Playback speed">
      {SPEEDS.map((r) => (
        <button key={r} onClick={() => onRate(r)} aria-pressed={rate === r}
          className={cn("min-h-7 rounded px-1.5 font-mono text-[11px] text-muted-foreground hover:bg-accent", rate === r && "bg-accent text-foreground")}>{r}×</button>
      ))}
    </div>
  );
}

/** Audio or video for a workspace file. `src` only changes when the file does, so a playing element survives polling. */
export const MediaPlayer = forwardRef<HTMLVideoElement, { f: FileInfo; kind: "audio" | "video"; label?: string; className?: string }>(function MediaPlayer({ f, kind, label, className }, ref) {
  const { file } = useApp();
  const [rate, setRate] = useStored<number>("media.rate", 1);
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => el.current!, []);
  const src = `${file(f.path)}&v=${Math.round(f.mtime)}`;
  // defaultPlaybackRate survives a new src; playbackRate applies now
  useEffect(() => { const m = el.current; if (m) { m.defaultPlaybackRate = rate; m.playbackRate = rate; } }, [rate, src]);
  if (kind === "video") return (
    <div className="grid gap-1">
      <video ref={el} controls preload="metadata" src={src} className={className} />
      <Speed rate={rate} onRate={setRate} />
    </div>
  );
  return (
    <div className="grid items-center gap-1.5 text-xs @3xl:grid-cols-[minmax(0,200px)_1fr_auto] @3xl:gap-2.5">
      <span className="truncate font-mono" title={f.path}>{label ?? basename(f.path)} <span className="text-muted-foreground">{mb(f.size)} · {ago(f.mtime)}</span></span>
      <audio ref={el as unknown as React.Ref<HTMLAudioElement>} controls preload="none" src={src} />
      <Speed rate={rate} onRate={setRate} />
    </div>
  );
});
