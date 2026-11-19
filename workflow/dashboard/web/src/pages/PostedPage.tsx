import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, ImageOff, Play, RefreshCw, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, cn } from "@/lib/utils";
import type { PostedData, PostedMark, PostedRow, PostStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/fields";
import { EmptyState, PageHeader, Segmented } from "@/components/ui/layout";
import { JobLog } from "@/components/analytics/JobLog";

type Filter = "todo" | "all";
const TONE: Record<PostStatus, "neutral" | "warning" | "success"> = { none: "neutral", draft: "warning", live: "success" };
const WORD: Record<PostStatus, string> = { none: "not posted", draft: "draft", live: "live" };

/** Copy that also works over plain http on the LAN, where navigator.clipboard is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

const done = (r: PostedRow) => r.youtube.status === "live" && r.instagram?.status === "live" && r.facebook?.status === "live";

/** Posted: every video and short across projects, and where each one is (YouTube, Instagram, Facebook). YouTube is read
 *  from the linked upload and the last analytics refresh; Instagram and Facebook you mark yourself after posting. */
export function PostedPage() {
  const { toast } = useApp();
  const [data, setData] = useState<PostedData | null>(null);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);
  const [filter, setFilter] = useStored<Filter>("posted.filter", "todo");

  const load = useCallback(async () => { try { setData(await api.posted()); } catch (e) { toast((e as Error).message); } }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => filter === "all" || (r.ready && !done(r)));
    const m = new Map<string, PostedRow[]>();
    for (const r of rows) m.set(r.ws, [...(m.get(r.ws) ?? []), r]);
    return [...m.entries()].reverse();   // newest project first
  }, [data, filter]);

  const refreshYt = async () => {
    try { const r = await api.analyticsRun("fetch"); setJob({ id: r.job.id, label: r.job.label }); } catch (e) { toast((e as Error).message); }
  };

  if (!data) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const rows = data.rows, ready = rows.filter((r) => r.ready);
  const count = (p: "youtube" | "instagram" | "facebook") => ready.filter((r) => (p === "youtube" ? r.youtube.status : r[p]?.status) === "live").length;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        title="Posted"
        info={<>Where every finished video and short is. <b>YouTube</b> updates itself: link the upload once, and its status (public = live; private, unlisted or scheduled = draft) comes from the last analytics refresh. <b>Instagram</b> and <b>Facebook</b> you mark here after posting (Meta Business Suite can post one Reel to both, as a draft or scheduled). Copy gives a caption made from the project's own title, description and hashtags.</>}
        sub={<>{ready.length} finished · live on YouTube {count("youtube")}, Instagram {count("instagram")}, Facebook {count("facebook")} · YouTube status {data.fetchedAt ? `from ${ago(Date.parse(data.fetchedAt))}` : "not fetched yet"}</>}
        actions={<>
          <Segmented value={filter} onChange={setFilter} label="Show" options={[{ value: "todo", label: "To post" }, { value: "all", label: "All" }]} />
          <Button variant="default" disabled={!!job} onClick={refreshYt} title="Run the analytics refresh (bun run yt:fetch) to update YouTube status"><RefreshCw />Refresh YouTube</Button>
        </>}
      />
      {job && <JobLog job={job.id} label={job.label} onEnd={() => void load()} onClose={() => setJob(null)} />}
      {!groups.length
        ? <EmptyState icon={<Send />} title={filter === "todo" ? "Nothing waiting" : "No videos yet"}>{filter === "todo" ? "Every finished video and short is live on all three. Switch to All to see them." : "Finished videos and shorts show up here."}</EmptyState>
        : groups.map(([ws, items]) => (
          <section key={ws} className="grid gap-2">
            <h2 className="m-0 font-mono text-[12px] text-muted-foreground"><a className="hover:text-foreground" href={`#view=ws&ws=${encodeURIComponent(ws)}`}>{ws}</a></h2>
            {items.map((r) => <Item key={`${r.ws}/${r.short ?? "video"}`} r={r} unlinked={data.unlinked} reload={load} />)}
          </section>
        ))}
    </div>
  );
}

function Item({ r, unlinked, reload }: { r: PostedRow; unlinked: PostedData["unlinked"]; reload: () => Promise<void> }) {
  const [playing, setPlaying] = useState(false);
  return (
    <Card className={cn(!r.ready && "opacity-70")}>
      <CardBody className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
        <Preview r={r} playing={playing} onPlay={() => setPlaying(true)} />
        <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={r.kind === "short" ? "info" : "neutral"}>{r.short ?? "Long video"}</Badge>
          <b className="min-w-0 flex-1 text-[13.5px]">{r.title}</b>
          {r.finalAt ? <span className="text-[11.5px] text-muted-foreground">final rendered {ago(r.finalAt)}</span> : !r.ready && <Badge tone="neutral">not rendered yet</Badge>}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <YouTubeCell r={r} unlinked={unlinked} reload={reload} />
          <ManualCell r={r} platform="instagram" reload={reload} />
          <ManualCell r={r} platform="facebook" reload={reload} />
        </div>
        </div>
        {playing && r.media.video && (
          <div className="relative md:col-span-2">
            <video src={api.fileUrl(r.ws, r.media.video)} controls autoPlay playsInline className={cn("mx-auto max-h-[70dvh] rounded-md bg-black", r.kind === "short" ? "aspect-[9/16]" : "w-full")} />
            <Button size="icon" variant="secondary" className="absolute right-2 top-2" aria-label="Close the player" onClick={() => setPlaying(false)}><X /></Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** What the item looks like, so it can be told apart without its title (Instagram shows none): a long video's YouTube or
 *  package thumbnail, a short's three frames. Falls through to the next picture when one does not load. Click = play. */
function Preview({ r, playing, onPlay }: { r: PostedRow; playing: boolean; onPlay: () => void }) {
  const m = r.media;
  const frames = m.frames ? `/api/posted/frames?ws=${encodeURIComponent(r.ws)}${r.short ? `&short=${encodeURIComponent(r.short)}` : ""}` : null;
  const pkg = m.thumb ? api.fileUrl(r.ws, m.thumb) : null;
  const srcs = (r.kind === "short" ? [frames, m.ytThumb] : [m.ytThumb, pkg, frames]).filter((x): x is string => !!x);
  const [i, setI] = useState(0);
  const src = srcs[i];
  const label = src === frames ? "frames of the video" : "the video's thumbnail";
  const body = src
    ? <img src={src} alt={`${r.title}: ${label}`} loading="lazy" onError={() => setI((n) => n + 1)} className="aspect-video w-full rounded-md bg-muted object-contain" />
    : <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md bg-muted text-[11.5px] text-muted-foreground"><ImageOff className="size-4" />no picture yet</div>;
  if (!m.video || playing) return body;
  return (
    <button type="button" onClick={onPlay} className="group relative block w-full rounded-md focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Play ${r.title}`} title="Play the final render">
      {body}
      <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 transition-colors group-hover:bg-black/30">
        <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white opacity-80 group-hover:opacity-100"><Play className="size-4 fill-current" /></span>
      </span>
    </button>
  );
}

function CopyCaption({ text, what }: { text: string; what: string }) {
  const { toast } = useApp();
  return <Button size="sm" variant="secondary" disabled={!text.trim()} onClick={async () => toast((await copyText(text)) ? `${what} caption copied` : "Copy failed")}><Copy />Caption</Button>;
}

function Cell({ name, status, label, children }: { name: string; status: PostStatus; label?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2 rounded-md border p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><b className="text-[12.5px]">{name}</b><Badge tone={TONE[status]} className="max-w-full truncate" title={label ?? WORD[status]}>{label ?? WORD[status]}</Badge></div>
      {children}
    </div>
  );
}

function YouTubeCell({ r, unlinked, reload }: { r: PostedRow; unlinked: PostedData["unlinked"]; reload: () => Promise<void> }) {
  const { toast } = useApp();
  const [paste, setPaste] = useState("");
  const link = async (id: string | null) => {
    try { await api.analyticsLink(r.ws, id, r.short ?? undefined); setPaste(""); await reload(); } catch (e) { toast((e as Error).message); }
  };
  const y = r.youtube, options = unlinked.filter((u) => u.short === (r.kind === "short"));
  return (
    <Cell name="YouTube" status={y.status} label={y.ytId ? y.label : undefined}>
      {y.ytId ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {y.url && <Button size="sm" variant="outline" onClick={() => window.open(y.url!, "_blank", "noreferrer")}><ExternalLink />Open</Button>}
          <CopyCaption text={r.captions.youtube} what="YouTube" />
          <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("Unlink this YouTube upload from this item?")) void link(null); }}>Unlink</Button>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <div className="text-[11.5px] text-muted-foreground">Uploaded it? Link the upload (private uploads count as draft).</div>
          {options.length > 0 && (
            <NativeSelect value="" onChange={(e) => e.target.value && void link(e.target.value)} aria-label="Pick the upload">
              <option value="">Pick from your uploads…</option>
              {options.map((u) => <option key={u.ytId} value={u.ytId}>{u.title}{u.privacy && u.privacy !== "public" ? ` (${u.privacy})` : ""}</option>)}
            </NativeSelect>
          )}
          <div className="flex gap-1.5">
            <Input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="or paste its link" aria-label="YouTube link" />
            <Button size="sm" disabled={!paste.trim()} onClick={() => link(paste.trim())}>Link</Button>
          </div>
          <CopyCaption text={r.captions.youtube} what="YouTube" />
        </div>
      )}
    </Cell>
  );
}

function ManualCell({ r, platform, reload }: { r: PostedRow; platform: "instagram" | "facebook"; reload: () => Promise<void> }) {
  const { toast } = useApp();
  const m: PostedMark | null = r[platform];
  const [url, setUrl] = useState(m?.url ?? "");
  const name = platform === "instagram" ? "Instagram" : "Facebook";
  const set = async (status: PostStatus) => {
    try { await api.setPosted({ ws: r.ws, short: r.short, platform, status, url: url.trim() || undefined }); await reload(); } catch (e) { toast((e as Error).message); }
  };
  const status = m?.status ?? "none";
  return (
    <Cell name={name} status={status}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(["draft", "live"] as const).map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => set(status === s ? "none" : s)} title={status === s ? "Click again to clear" : `Mark as ${s}`}>{s === "draft" ? "Draft" : "Live"}</Button>)}
        <CopyCaption text={r.captions[platform]} what={name} />
        {m?.url && <Button size="sm" variant="ghost" onClick={() => window.open(m.url!, "_blank", "noreferrer")}><ExternalLink />Open</Button>}
      </div>
      <div className="flex gap-1.5">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${name} link (optional)`} aria-label={`${name} link`} />
        {status !== "none" && url.trim() !== (m?.url ?? "") && <Button size="sm" onClick={() => set(status)}>Save</Button>}
      </div>
      {m && <div className="text-[11px] text-muted-foreground">marked {ago(Date.parse(m.at))}</div>}
    </Cell>
  );
}
