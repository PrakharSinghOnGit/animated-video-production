import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Heart, KeyRound, MessageSquare, RefreshCw, RotateCcw, Sparkles, TriangleAlert, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { useStored } from "@/lib/storage";
import { ago, cn } from "@/lib/utils";
import { commentUrl, type CommentKind, type CommentStore, type CommentsData, type YtComment } from "@/lib/analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { NativeSelect, Textarea } from "@/components/ui/fields";
import { EmptyState, PageHeader, Segmented, StatCard } from "@/components/ui/layout";
import { JobLog } from "@/components/analytics/JobLog";

const TONE: Record<CommentKind, "success" | "info" | "warning" | "danger" | "neutral"> = {
  praise: "success", question: "info", addition: "info", disagreement: "warning", factual: "danger", quality: "danger", troll: "neutral", spam: "neutral",
};
type Filter = "todo" | "handled" | "all";

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

/** Comments inbox: every comment on the channel with a triage and a suggested reply. Nothing is posted from here:
 *  copy a draft, polish it, reply in YouTube (Open), then mark it done. */
export function CommentsPage() {
  const { toast } = useApp();
  const [data, setData] = useState<CommentsData | null>(null);
  const [job, setJob] = useState<{ id: string; label: string } | null>(null);
  const [filter, setFilter] = useStored<Filter>("comments.filter", "todo");
  const [video, setVideo] = useStored<string>("comments.video", "");

  const load = useCallback(async () => {
    try { const d = await api.comments(); setData(d); if (d.running?.step === "yt:comments") setJob((j) => j ?? { id: d.running!.id, label: d.running!.label }); }
    catch (e) { toast((e as Error).message); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const run = async (redraft = false) => {
    if (redraft && !window.confirm(`Draft new replies for every comment still waiting on you with ${data?.model}? Drafts you edited are kept.`)) return;
    try { const r = await api.analyticsRun("comments", { redraft }); setJob({ id: r.job.id, label: r.job.label }); }
    catch (e) { toast((e as Error).message); }
  };
  const onChange = (c: YtComment) => setData((d) => d?.store ? { ...d, store: { ...d.store, comments: { ...d.store.comments, [c.id]: c } } } : d);

  if (!data) return <div className="p-6 text-muted-foreground">Loading comments…</div>;
  const store = data.store;
  const all = store ? Object.values(store.comments).sort((a, b) => b.at.localeCompare(a.at)) : [];
  const todo = all.filter((c) => c.status === "todo");
  const busy = !!data.running;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-5 px-6 pb-12 pt-6 max-sm:px-4">
      <PageHeader
        title="Comments"
        info={<>Every comment on the channel, sorted into kinds, with a suggested reply drafted by <b>{data.model}</b> (Settings → Agent models → Comment reply drafts). Nothing is posted from here: copy a draft, make it yours, reply on YouTube, then mark it done. Comments you have already replied to are marked done on the next refresh.</>}
        sub={store ? <>Fetched {ago(store.fetchedAt)} · drafts by {data.model}</> : "Not fetched yet"}
        actions={<>
          <Button disabled={busy || !store || !todo.length} onClick={() => run(true)} title="Draft again for every comment waiting on you (no refetch)"><Sparkles />Redraft</Button>
          <Button variant="default" disabled={busy || !data.hasKey} onClick={() => run(false)}><RefreshCw />Refresh</Button>
        </>}
      />
      {job && <JobLog job={job.id} label={job.label} onEnd={() => void load()} onClose={() => setJob(null)} />}
      {!data.hasKey && <KeySetup />}
      {!store
        ? data.hasKey && <EmptyState icon={<MessageSquare />} title="No comments fetched yet" action={<Button variant="default" disabled={busy} onClick={() => run(false)}><RefreshCw />Fetch comments</Button>}>Pulls every public comment and drafts replies for the new ones.</EmptyState>
        : <Inbox store={store} all={all} filter={filter} setFilter={setFilter} video={video} setVideo={setVideo} locked={busy} onChange={onChange} />}
    </div>
  );
}

function KeySetup() {
  return (
    <Card>
      <CardHeader><KeyRound className="size-4 text-muted-foreground" /><CardTitle>Add a YouTube API key</CardTitle></CardHeader>
      <CardBody className="text-[13px]">
        <span>Comments are read with an API key, which can only read public data. (Google won't list comments through the read-only sign-in; it needs a scope that can also post.)</span>
        <ol className="m-0 grid list-decimal gap-1 pl-5">
          <li>Google Cloud (same project as the sign-in) → APIs &amp; Services → Credentials → <b>Create credentials → API key</b>.</li>
          <li>Restrict it to <b>YouTube Data API v3</b>.</li>
          <li>Settings → Environment: add <code>YOUTUBE_API_KEY</code> (or put it in <code>.env</code>), then Refresh.</li>
        </ol>
      </CardBody>
    </Card>
  );
}

function Inbox({ store, all, filter, setFilter, video, setVideo, locked, onChange }: {
  store: CommentStore; all: YtComment[]; filter: Filter; setFilter: (f: Filter) => void; video: string; setVideo: (v: string) => void; locked: boolean; onChange: (c: YtComment) => void;
}) {
  const todo = all.filter((c) => c.status === "todo");
  const hearts = todo.filter((c) => c.triage?.heart).length;
  const feedback = all.filter((c) => c.triage?.kind === "quality" || c.triage?.kind === "factual");
  const vids = useMemo(() => [...new Set(all.map((c) => c.videoId))].map((id) => ({ id, title: store.videos[id]?.title ?? id, n: all.filter((c) => c.videoId === id).length })), [all, store]);
  const shown = all.filter((c) => (filter === "all" || (filter === "todo" ? c.status === "todo" : c.status !== "todo")) && (!video || c.videoId === video));

  return (
    <>
      <div className="wg-stagger grid grid-cols-2 gap-3 @2xl:grid-cols-4">
        <StatCard icon={<MessageSquare />} label="Waiting on you" value={todo.length} hint={todo.filter((c) => c.triage?.reply === false).length ? `${todo.filter((c) => c.triage?.reply === false).length} need no reply` : undefined} />
        <StatCard icon={<Heart />} tone="destructive" label="Worth a heart" value={hearts} hint="among those waiting" />
        <StatCard icon={<Check />} tone="success" label="Handled" value={all.length - todo.length} />
        <StatCard icon={<MessageSquare />} tone="info" label="All comments" value={all.length} hint={`on ${vids.length} video${vids.length === 1 ? "" : "s"}`} />
      </div>

      {feedback.length > 0 && (
        <Card>
          <CardHeader><TriangleAlert className="size-4 text-warning" /><CardTitle>Production feedback</CardTitle><CardSub>Quality and factual comments: a repeat is a pipeline fix, not a reply</CardSub></CardHeader>
          <CardBody className="text-[13px]">
            <ul className="m-0 grid list-disc gap-1 pl-5 marker:text-subtle-foreground">
              {feedback.map((c) => <li key={c.id}><b>{store.videos[c.videoId]?.title ?? c.videoId}</b> [{c.triage!.kind}]: {c.triage!.summary || c.text.slice(0, 140)}</li>)}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "todo", label: `To reply (${todo.length})` }, { value: "handled", label: "Handled" }, { value: "all", label: "All" }]} />
        <NativeSelect aria-label="Video" value={video} onChange={(e) => setVideo(e.target.value)} className="w-auto max-w-full text-xs">
          <option value="">All videos</option>
          {vids.map((v) => <option key={v.id} value={v.id}>{v.title} ({v.n})</option>)}
        </NativeSelect>
      </div>

      {shown.length
        ? <div className="grid gap-3">{shown.map((c) => <CommentCard key={c.id} c={c} video={store.videos[c.videoId]} locked={locked} onChange={onChange} />)}</div>
        : <EmptyState icon={<Check />} title={filter === "todo" ? "Inbox zero" : "Nothing here"}>{filter === "todo" ? "Every comment has been replied to or skipped. Refresh to check for new ones." : "No comments match this filter."}</EmptyState>}
    </>
  );
}

function CommentCard({ c, video, locked, onChange }: { c: YtComment; video?: { title: string; short: boolean; ws?: string }; locked: boolean; onChange: (c: YtComment) => void }) {
  const { toast } = useApp();
  const t = c.triage;
  const [draft, setDraft] = useState(t?.draft ?? "");
  useEffect(() => { setDraft(t?.draft ?? ""); }, [t?.draft]);
  const dirty = draft !== (t?.draft ?? "");
  const [saving, setSaving] = useState(false);

  const patch = async (p: { status?: YtComment["status"]; draft?: string }) => {
    setSaving(true);
    try { const r = await api.commentUpdate(c.id, p); onChange(r.comment); }
    catch (e) { toast((e as Error).message); }
    finally { setSaving(false); }
  };
  const copy = async () => { toast((await copyText(draft)) ? "Draft copied: paste it in the reply box" : "Copy blocked: select the text and copy it"); };
  const handled = c.status !== "todo";

  return (
    <Card className={cn(handled && "opacity-75")}>
      <CardBody className="gap-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="font-semibold">{c.author}</b>
          <span className="text-muted-foreground">on</span>
          <span className="min-w-0 truncate text-muted-foreground" title={video?.title}>{video?.title ?? c.videoId}</span>
          {video?.short && <Badge>short</Badge>}
          <span className="text-[12px] text-subtle-foreground">{ago(c.at)}{c.likes ? ` · ${c.likes} like${c.likes > 1 ? "s" : ""}` : ""}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {t && <Badge tone={TONE[t.kind] ?? "neutral"}>{t.kind}</Badge>}
            {t?.heart && !handled && <Badge tone="danger"><Heart className="size-3" />heart it</Badge>}
            {t && !t.reply && !handled && <Badge>no reply needed</Badge>}
            {c.status === "done" && <Badge tone="success">{c.repliedByMe ? "replied" : "done"}</Badge>}
            {c.status === "skip" && <Badge>skipped</Badge>}
          </div>
        </div>

        <blockquote className="m-0 whitespace-pre-wrap border-l-2 border-border-strong pl-3">{c.text}</blockquote>
        {c.replies.length > 0 && (
          <div className="grid gap-1.5 pl-6">
            {c.replies.map((r) => (
              <div key={r.id} className={cn("whitespace-pre-wrap border-l-2 pl-3 text-[12.5px]", r.mine ? "border-brand" : "border-border")}>
                <b className={cn("font-medium", r.mine && "text-brand")}>{r.mine ? "You" : r.author}</b> <span className="text-subtle-foreground">· {ago(r.at)}</span>
                <div>{r.text}</div>
              </div>
            ))}
          </div>
        )}

        {!handled && (t?.reply !== false || draft) && (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="font-medium">{t?.edited ? "Your draft" : t ? `Suggested reply · ${t.model}` : "Your reply"}</span>
              {t?.summary && <span className="truncate text-subtle-foreground">({t.summary})</span>}
            </div>
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 110)))} className="font-sans text-[13px]" placeholder={t ? "" : "No draft yet: Refresh drafts one, or write your own"} />
            {t?.check && <div className="flex gap-1.5 text-[12.5px] text-warning"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /><span>Check before posting: {t.check}</span></div>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {!handled && draft && <Button size="sm" onClick={copy}><Copy />Copy</Button>}
          <Button size="sm" variant="outline" asChild><a href={commentUrl(c)} target="_blank" rel="noreferrer"><ExternalLink />Open on YouTube</a></Button>
          {!handled && dirty && <>
            <Button size="sm" disabled={saving || locked} onClick={() => patch({ draft })}><Check />Save draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(t?.draft ?? "")}><RotateCcw />Undo edits</Button>
          </>}
          <div className="ml-auto flex gap-1.5">
            {handled
              ? <Button size="sm" variant="ghost" disabled={saving || locked} onClick={() => patch({ status: "todo" })}><Undo2 />Reopen</Button>
              : <>
                <Button size="sm" variant="ghost" disabled={saving || locked} onClick={() => patch({ status: "skip" })}><X />Skip</Button>
                <Button size="sm" variant="default" disabled={saving || locked} onClick={() => patch({ ...(dirty ? { draft } : {}), status: "done" })}><Check />Replied</Button>
              </>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
