import { forwardRef } from "react";
import { basename, mb, ago } from "@/lib/utils";
import { useApp } from "@/hooks/app";
import type { FileInfo } from "@/lib/types";

/** Audio or video for a workspace file. `src` only changes when the file does, so a playing element survives polling. */
export const MediaPlayer = forwardRef<HTMLVideoElement, { f: FileInfo; kind: "audio" | "video"; label?: string; className?: string }>(function MediaPlayer({ f, kind, label, className }, ref) {
  const { file } = useApp();
  const src = `${file(f.path)}&v=${Math.round(f.mtime)}`;
  if (kind === "video") return <video ref={ref} controls preload="metadata" src={src} className={className} />;
  return (
    <div className="grid items-center gap-1.5 text-xs md:grid-cols-[minmax(0,200px)_1fr] md:gap-2.5">
      <span className="truncate font-mono" title={f.path}>{label ?? basename(f.path)} <span className="text-muted-foreground">{mb(f.size)} · {ago(f.mtime)}</span></span>
      <audio controls preload="none" src={src} />
    </div>
  );
});
