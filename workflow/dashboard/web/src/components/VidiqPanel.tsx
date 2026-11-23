import { useEffect, useState } from "react";
import { Copy, Download, RefreshCw } from "lucide-react";
import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago, cn, copyText } from "@/lib/utils";
import type { PubVidiq, VidiqStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/fields";
import { RunButton } from "@/components/RunButton";

const V = ["A", "B", "C"] as const;
const scoreTone = (n: number | null | undefined) => (n == null ? "text-muted-foreground" : n >= 90 ? "text-success" : n >= 75 ? "text-foreground" : "text-warning");

/**
 * vidIQ in the Packaging step: connection + credits, title scores and suggestions, AI thumbnails. Every run is a click
 * (that is the approval) and checks the balance first; when vidIQ is not connected or short, the run just says so.
 */
export function VidiqPanel({ vq, onEnlarge }: { vq: PubVidiq | null; onEnlarge: (src: string) => void }) {
  const { file, busy, run, toast } = useApp();
  const [st, setSt] = useState<VidiqStatus | null>(null);
  const [variant, setVariant] = useState<string>("A");
  const load = (refresh = false) => api.vidiq(refresh).then(setSt).catch(() => setSt({ connected: false, reason: "dashboard could not ask vidIQ" }));
  // re-ask after a vidIQ job ends: the balance changed, or the login finished
  const vidiqBusy = /^vidIQ|^Connect vidIQ/.test(busy?.label ?? "");
  useEffect(() => { void load(!vidiqBusy && st !== null); }, [vidiqBusy]);   // eslint-disable-line react-hooks/exhaustive-deps

  const t = vq?.titles, thumbs = vq?.thumbs ?? [];
  const copy = async (s: string) => toast((await copyText(s)) ? "Title copied" : "Copy failed");
  return (
    <div className="grid gap-4 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        {st === null ? <span className="text-muted-foreground">Asking vidIQ…</span>
          : st.connected ? <><Badge tone="success">vidIQ connected</Badge><span><b>{st.credits}</b> credits{st.resetsAt ? ` · renews ${st.resetsAt.slice(0, 10)}` : ""}</span>{st.channels?.[0] && <span className="text-muted-foreground">· {st.channels[0].title ?? st.channels[0].id}</span>}</>
          : <><Badge tone="neutral">vidIQ not connected</Badge><span className="text-muted-foreground">{st.reason}</span>
              <RunButton running={busy?.label === "Connect vidIQ"} disabled={!!busy} label="Connect vidIQ" onClick={() => void run("publish.vidiq.login")} />
              <span className="text-[11px] text-subtle-foreground">opens the sign-in in the browser on the Mac running the dashboard</span></>}
        <Button size="sm" variant="ghost" aria-label="Refresh vidIQ status" onClick={() => void load(true)}><RefreshCw /></Button>
      </div>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <b>Title scores</b><Badge tone="neutral">15–20 credits</Badge>
          <RunButton running={busy?.label === "vidIQ title scores"} disabled={!!busy || st?.connected === false} label={t ? "Score again" : "Score titles"} onClick={() => void run("publish.vidiq.titles")} />
          {t && <span className="text-[11px] text-muted-foreground">scored {ago(Date.parse(t.at))}</span>}
        </div>
        {t && (
          <div className="grid gap-1">
            {V.map((v) => t.scores[v] && (
              <div key={v} className="flex items-baseline gap-2">
                <span className="w-4 font-mono">{v}</span>
                <span className={cn("w-8 text-right font-mono font-semibold", scoreTone(t.scores[v]!.score))}>{t.scores[v]!.score ?? "?"}</span>
                <span className="min-w-0">{t.scores[v]!.title}{t.scores[v]!.note && <span className="block text-[11px] text-muted-foreground">{t.scores[v]!.note}</span>}</span>
              </div>
            ))}
            {t.suggestions.length > 0 && <>
              <div className="mt-1.5 text-[11px] text-muted-foreground">vidIQ's suggestions. They are not checked by our title rules (sourced numbers, three different bets); check before using one.</div>
              {t.suggestions.map((s) => (
                <div key={s.title} className="flex items-center gap-2">
                  <span className="w-4" />
                  <span className={cn("w-8 text-right font-mono font-semibold", scoreTone(s.score))}>{s.score ?? "?"}</span>
                  <span className="min-w-0 flex-1">{s.title}</span>
                  <Button size="sm" variant="ghost" aria-label={`Copy ${s.title}`} onClick={() => void copy(s.title)}><Copy /></Button>
                </div>
              ))}
            </>}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <b>AI thumbnails</b><Badge tone="neutral">22 credits each</Badge>
          <NativeSelect className="w-auto text-xs" aria-label="Variant" value={variant} onChange={(e) => setVariant(e.target.value)}>
            {[...V, "all"].map((v) => <option key={v} value={v}>{v === "all" ? "all three" : `for ${v}`}</option>)}
          </NativeSelect>
          <RunButton running={busy?.label === "vidIQ thumbnails"} disabled={!!busy || st?.connected === false} label="Make" onClick={() => void run("publish.vidiq.thumbs", undefined, { variant })} />
          <span className="text-[11px] text-muted-foreground">from the package's brief and words, styled on our three thumbnails · ~2 min each</span>
        </div>
        {thumbs.length > 0 && (
          <div className="grid gap-3 @3xl:grid-cols-3">
            {thumbs.map((x) => {
              const src = `${file(x.info.path)}&v=${Math.round(x.info.mtime)}`;
              return (
                <figure key={x.file} className="m-0 grid min-w-0 gap-1">
                  <img src={src} alt={`vidIQ thumbnail for ${x.variant}`} className="block w-full cursor-zoom-in rounded border" onClick={() => onEnlarge(src)} />
                  <figcaption className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <b className="font-mono text-foreground">{x.variant}</b>
                    {x.score != null && <span title="vidIQ's own rough score">self-score {x.score}</span>}
                    <span>{x.references ? `styled on ${x.references}` : "no references"}</span>
                    <span>· {ago(Date.parse(x.at))}</span>
                    <a className="ml-auto inline-flex items-center gap-1 text-brand" href={file(x.info.path)} download><Download className="size-3.5" />Download</a>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
        {thumbs.length > 0 && <div className="text-[11px] text-subtle-foreground">These skip our free checks (sourced numbers, phone-size reading): look at the words on them before uploading one.</div>}
      </section>
    </div>
  );
}
