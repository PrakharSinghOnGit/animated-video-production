import { Clapperboard, Download } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import type { DeliverInfo, DeliverItem } from "@/lib/types";
import { ago, mb } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/FileLine";
import { RunButton } from "@/components/RunButton";

const GROUPS: [string, string, string][] = [
  ["video", "Video", "mp4 with the audio variants you can pick from"],
  ["audio", "Audio mixes", "wav"],
  ["stems", "Stems", "voice, foley and music apart, to remix elsewhere"],
  ["sfx", "SFX pack", "every foley clip (and the music files) in one zip"],
  ["project", "Final Cut Pro project", "video, voice, every SFX on its own clip, music"],
];

function Row({ it, href }: { it: DeliverItem; href: string }) {
  const name = it.file.split("/").pop();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-1.5 text-[12.5px] last:border-b-0">
      <span className="min-w-0 flex-1 basis-48">
        <span className="font-medium">{it.label}</span>
        <span className="ml-2 font-mono text-[11px] text-muted-foreground">{name}</span>
        {it.note && <span className="block text-[11.5px] text-muted-foreground">{it.note}</span>}
      </span>
      {it.present ? <span className="text-xs text-muted-foreground">{mb(it.bytes)}</span> : <Badge tone="warning">file missing</Badge>}
      <Button size="sm" variant="secondary" asChild={it.present} disabled={!it.present}>
        {it.present ? <a href={href} download={name}><Download />Download</a> : <span><Download />Download</span>}
      </Button>
    </div>
  );
}

/**
 * The files in 08-deliver (deliver.json) of the long video or of one short, grouped, with a download link each, the
 * "Build downloads" action and "Open in Final Cut Pro". `staleAfter` = mtime of the newest source (a later render makes the list old).
 */
export function Downloads({ short, info, staleAfter }: { short?: string; info: DeliverInfo | null | undefined; staleAfter?: number }) {
  const { ws, busy } = useApp();
  const runSaved = useRunSaved();
  if (!ws) return null;
  const prefix = short ? `shorts/${short}/` : "";
  const buildKey = short ? "deliver.short" : "deliver.build", fcpKey = short ? "fcp.short" : "fcp.open";
  const buildLabel = short ? `Build downloads ${short}` : "Build downloads", fcpLabel = short ? `Open in Final Cut Pro ${short}` : "Open in Final Cut Pro";
  const items = info?.items ?? [];
  const known = new Set(GROUPS.map((g) => g[0]));
  const groups = [...GROUPS, ...[...new Set(items.map((i) => i.group))].filter((g) => !known.has(g)).map((g): [string, string, string] => [g, g, ""])];
  const stale = !!info && !!staleAfter && info.builtAt < staleAfter;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <RunButton primary label="Build downloads" running={busy?.label === buildLabel} disabled={!!busy} onClick={() => runSaved(buildKey, short)} />
        <Button variant="secondary" disabled={!!busy} onClick={() => runSaved(fcpKey, short)}>{busy?.label === fcpLabel ? "Opening…" : <><Clapperboard />Open in Final Cut Pro</>}</Button>
        <span className="text-xs text-muted-foreground">{info ? `built ${ago(info.builtAt)} · ${items.length} files` : "not built yet"}</span>
      </div>
      {!info && <Note>Nothing to download yet: <b>Build downloads</b> collects the video, the audio mixes, the stems, the SFX pack and the Final Cut Pro project in <code>{prefix}08-deliver/</code>. It needs a rendered video.</Note>}
      {stale && <Note>A newer render or mix exists than this list ({ago(staleAfter)} vs built {ago(info!.builtAt)}): build the downloads again.</Note>}
      {info && items.length === 0 && <div className="text-xs text-muted-foreground">deliver.json lists no files.</div>}
      {groups.map(([g, title, sub]) => {
        const its = items.filter((i) => i.group === g);
        if (!its.length) return null;
        return (
          <div key={g}>
            <div className="mb-0.5 flex items-baseline gap-2"><b className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</b><span className="text-[11px] text-muted-foreground">{sub}</span></div>
            <div className="rounded-lg border px-3">{its.map((it) => <Row key={it.key} it={it} href={api.downloadUrl(ws, prefix + it.file)} />)}</div>
          </div>
        );
      })}
    </div>
  );
}
