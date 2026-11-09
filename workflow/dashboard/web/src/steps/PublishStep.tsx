import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunSaved } from "@/hooks/useRunSaved";
import { api } from "@/lib/api";
import { ago, dur, money } from "@/lib/utils";
import { pubMetaApplied, pubNotesOpen, stepSpec } from "@/lib/pipeline";
import type { PubChecks, PubIssue, PubMeta, PubThumb, Variant } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/fields";
import { RunButton } from "@/components/RunButton";
import { Note } from "@/components/FileLine";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { BlockFold, Flow, withKids } from "@/components/Flow";
import { cn } from "@/lib/utils";

const V: Variant[] = ["A", "B", "C"];
const SEV: Record<string, string> = { high: "text-destructive", medium: "text-warning", low: "text-muted-foreground" };
const TITLE_TRUNC = 60, TITLE_MAX = 100;

const copy = async (text: string, toast: (m: string) => void, what: string) => {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast("Copy failed: select the text and copy it"); }
};

function Checks({ c }: { c: PubChecks | null | undefined }) {
  if (!c || (!c.errors.length && !c.warnings.length)) return null;
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0 text-[12px]">
      {c.errors.map((e, i) => <li key={`e${i}`} className="text-destructive">✗ {e}</li>)}
      {c.warnings.map((w, i) => <li key={`w${i}`} className="text-warning">⚠ {w}</li>)}
    </ul>
  );
}

/** Full-size view of one thumbnail (click anywhere or Escape to close, arrows to switch). */
function Enlarge({ items, index, onIndex, onClose }: { items: { id: string; src: string }[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const step = (n: number) => onIndex((index + n + items.length) % items.length);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const x = items[index];
  if (!x) return null;
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/90 p-3" role="dialog" aria-modal onClick={onClose}>
      <img src={x.src} alt={`Thumbnail ${x.id}`} className="max-h-[82dvh] max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="flex items-center gap-2 text-muted-foreground" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" onClick={() => step(-1)}>←</Button>
        <span className="font-mono text-xs">{x.id} ({index + 1}/{items.length})</span>
        <Button size="sm" onClick={() => step(1)}>→</Button>
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/** What a viewer sees in the home feed: thumbnail with the duration badge, then the title (2 lines), channel, views. Real sizes: 360 px wide. */
function FeedCard({ src, title, dark, badge }: { src: string; title: string; dark: boolean; badge: string }) {
  const fg = dark ? "#f1f1f1" : "#0f0f0f", sub = dark ? "#aaaaaa" : "#606060";
  return (
    <div className="shrink-0 p-4" style={{ background: dark ? "#0f0f0f" : "#ffffff", color: fg, width: 392, fontFamily: "Roboto, Arial, sans-serif" }}>
      <div className="relative overflow-hidden" style={{ width: 360, height: 202.5, borderRadius: 12, background: "#888" }}>
        <img src={src} alt="" style={{ width: 360, height: 202.5, display: "block" }} />
        <span className="absolute" style={{ right: 8, bottom: 8, background: "rgba(0,0,0,.8)", color: "#fff", borderRadius: 4, padding: "1px 4px", fontSize: 12, fontWeight: 500, lineHeight: "16px" }}>{badge}</span>
      </div>
      <div className="mt-3 flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" style={{ background: "#101010", color: "#f2e9e4" }}>WG</div>
        <div className="min-w-0">
          <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "22px", maxHeight: 44, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{title || "(no title yet)"}</div>
          <div style={{ fontSize: 14, color: sub, lineHeight: "20px", marginTop: 4 }}>The Wealth Gap</div>
          <div style={{ fontSize: 14, color: sub, lineHeight: "20px" }}>12K views • 2 days ago</div>
        </div>
      </div>
    </div>
  );
}

/** Editable titles, description, tags, hashtags: saved back to metadata.json; the feed mock above follows the draft. */
function MetaEditor({ meta, titles, setTitles }: { meta: PubMeta; titles: Record<Variant, string>; setTitles: (t: Record<Variant, string>) => void }) {
  const { ws, refresh, toast } = useApp();
  const desc = useDraft(meta.description);
  const tags = useDraft(meta.tags.join(", "));
  const hash = useDraft(meta.hashtags.join(" "));
  const [saving, setSaving] = useState(false);
  const titlesDirty = V.some((v) => titles[v] !== meta.titles[v].title);
  const dirty = titlesDirty || desc.dirty || tags.dirty || hash.dirty;
  const save = async () => {
    setSaving(true);
    try {
      await api.saveMetadata(ws!, {
        titles, description: desc.v,
        tags: tags.v.split(",").map((t) => t.trim()).filter(Boolean),
        hashtags: hash.v.split(/[\s,]+/).filter(Boolean),
      });
      desc.saved(); tags.saved(); hash.saved();
      await refresh();
      toast("Titles and description saved");
    } catch (e) { toast((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">
        {V.map((v) => {
          const p = meta.titles[v], len = titles[v].length;
          return (
            <div key={v} className="grid gap-1 rounded-md border p-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-mono font-semibold">{v}</span><Badge tone="neutral">{p.type}</Badge>
                <span className={cn("font-mono text-[11px]", len > TITLE_MAX ? "text-destructive" : len > TITLE_TRUNC ? "text-warning" : "text-muted-foreground")}>{len} / {TITLE_MAX} (main promise within {TITLE_TRUNC})</span>
                <span className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => copy(titles[v], toast, `Title ${v}`)}><Copy />Copy</Button>
              </div>
              <Input value={titles[v]} onChange={(e) => setTitles({ ...titles, [v]: e.target.value })} aria-label={`Title ${v}`} />
              <div className="text-[11.5px] text-muted-foreground">{p.rationale}</div>
              <div className="text-[11.5px] text-muted-foreground">Thumbnail brief: {p.thumbnail} · Tests: {p.hypothesis}</div>
            </div>
          );
        })}
      </div>
      <div className="grid gap-1">
        <div className="flex items-center gap-2 text-[12px]"><b>Description</b><span className="font-mono text-[11px] text-muted-foreground">{desc.v.length} / 5000</span><span className="flex-1" /><Button size="sm" variant="secondary" onClick={() => copy(desc.v, toast, "Description")}><Copy />Copy</Button></div>
        <Textarea rows={16} value={desc.v} onChange={(e) => desc.set(e.target.value)} spellCheck aria-label="Description" />
      </div>
      <div className="grid gap-1">
        <div className="flex items-center gap-2 text-[12px]"><b>Tags</b><span className="text-[11px] text-muted-foreground">comma separated; low priority for YouTube, keep them short</span><span className="flex-1" /><Button size="sm" variant="secondary" onClick={() => copy(tags.v, toast, "Tags")}><Copy />Copy</Button></div>
        <Textarea rows={2} value={tags.v} onChange={(e) => tags.set(e.target.value)} aria-label="Tags" />
        <div className="flex items-center gap-2 text-[12px]"><b>Hashtags</b><span className="text-[11px] text-muted-foreground">exactly 3, also the last line of the description</span></div>
        <Input value={hash.v} onChange={(e) => hash.set(e.target.value)} aria-label="Hashtags" />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" disabled={!dirty || saving} onClick={save}>Save titles and description</Button>
        {dirty && <span className="text-xs text-warning">unsaved</span>}
        <span className="text-xs text-muted-foreground">Chapters are computed from the narration pauses; if you change the script, run the step again (your edits are kept unless you tick "Overwrite my edits").</span>
      </div>
      <Checks c={meta.checks} />
    </div>
  );
}

/** One review as folds like the act reviews: summary, set-wide issues, then per variant with a "To notes" button. */
function ReviewList({ reviews, toNotes }: { reviews: import("@/lib/types").PubReview[]; toNotes: (v: string, i: PubIssue) => void }) {
  if (!reviews.length) return <span className="text-xs text-muted-foreground">No reviews yet.</span>;
  return (
    <>
      {reviews.map((r, k) => (
        <BlockFold key={r.file} defaultOpen={k === 0}
          title={<span className="text-left text-foreground"><b>{r.agent}</b> · overall {r.overall}/10 · {V.map((v) => `${v} ${r.variants[v]?.score ?? "?"}`).join(" · ")} <span className="text-muted-foreground">· {ago(r.at)} · {dur(r.ms)} · {r.costUsd ? money(r.costUsd) : "free"}</span></span>}>
          <div className="pb-2">
            <div className="my-1.5 text-muted-foreground">{r.summary}</div>
            {[["all", r.all] as const, ...V.map((v) => [v, r.variants[v]?.issues ?? []] as const)].map(([v, issues]) => issues.length ? (
              <div key={v} className="mb-1">
                <div className="mt-2 font-mono text-[12px] font-semibold">{v === "all" ? "All variants" : `Variant ${v}`}</div>
                {issues.map((x, j) => (
                  <div key={j} className="grid grid-cols-[1fr_auto] gap-2.5 border-b border-border/60 py-2 text-[12.5px] last:border-0">
                    <div><span className={SEV[x.severity]}>{x.kind} · {x.severity}</span> {x.seen}<div className="text-muted-foreground">→ {x.fix}</div></div>
                    <Button size="sm" onClick={() => (v === "all" ? V : [v]).forEach((t) => toNotes(t, x))}>To notes</Button>
                  </div>
                ))}
              </div>) : null)}
          </div>
        </BlockFold>
      ))}
    </>
  );
}

export function PublishStep() {
  const { d, ws, file, refresh, toast, busy, run } = useApp();
  const runSaved = useRunSaved();
  const meta = d?.publish.metadata ?? null;
  const [titles, setTitlesState] = useState<Record<Variant, string>>({ A: "", B: "", C: "" });
  const [titlesTouched, setTouched] = useState(false);
  const noteA = useDraft(d?.publish.thumbs[0]?.notes ?? ""), noteB = useDraft(d?.publish.thumbs[1]?.notes ?? ""), noteC = useDraft(d?.publish.thumbs[2]?.notes ?? "");
  const noteM = useDraft(d?.publish.metaNotes ?? "");
  const notes: Record<string, ReturnType<typeof useDraft>> = { A: noteA, B: noteB, C: noteC, meta: noteM };
  const [lb, setLb] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  // titles follow the saved metadata until the user types
  const metaTitles = meta ? V.map((v) => meta.titles[v].title).join("\u0000") : "";
  useEffect(() => { if (meta && !titlesTouched) setTitlesState({ A: meta.titles.A.title, B: meta.titles.B.title, C: meta.titles.C.title }); }, [metaTitles, titlesTouched]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (meta && V.every((v) => titles[v] === meta.titles[v].title)) setTouched(false); }, [metaTitles, titles]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || !ws) return null;
  const p = d.publish, spec = stepSpec("publish", d);
  const setTitles = (t: Record<Variant, string>) => { setTitlesState(t); setTouched(true); };
  const src = (t: PubThumb) => (t.file ? `${file(t.file.path)}&v=${Math.round(t.file.mtime)}` : "");
  const shown = p.thumbs.filter((t) => t.file).map((t) => ({ id: t.id, src: src(t) }));
  const act = async (f: () => Promise<unknown>) => { setWorking(true); try { await f(); await refresh(); } catch (e) { toast((e as Error).message); } finally { setWorking(false); } };
  const addNote = (v: string, i: PubIssue) => notes[v].append(`[${i.kind}, ${i.severity}]: ${i.seen}. Fix: ${i.fix}`);
  const blocking = [...p.thumbs.flatMap((t) => t.checks?.errors.map((e) => `${t.id}: ${e}`) ?? []), ...(meta?.checks.errors ?? [])];

  const kids: Record<string, React.ReactNode> = {
    meta: meta ? <MetaEditor key={meta.at + String(meta.edited)} meta={meta} titles={titles} setTitles={setTitles} /> : undefined,
    thumbs: p.thumbs.some((t) => t.file) ? (
      <div className="grid gap-3 md:grid-cols-3">
        {p.thumbs.map((t) => (
          <figure key={t.id} className="m-0 grid min-w-0 gap-1.5">
            {t.file ? <img src={src(t)} alt={`Thumbnail ${t.id}`} className="block w-full cursor-zoom-in rounded border" onClick={() => setLb(shown.findIndex((x) => x.id === t.id))} /> : <div className="flex aspect-video items-center justify-center rounded border border-dashed text-xs text-muted-foreground">{t.id}: not designed yet</div>}
            <figcaption className="grid gap-0.5 text-[12px]">
              <div className="flex flex-wrap items-center gap-1.5"><b className="font-mono">{t.id}</b>{t.info && <span className="text-muted-foreground">{t.info.concept}</span>}{t.file && <span className="font-mono text-[11px] text-muted-foreground">{(t.file.size / 1048576).toFixed(2)} MB · {t.file.path.split(".").pop()}</span>}</div>
              {t.info && <div className="text-muted-foreground">Text: {t.info.text ? `“${t.info.text}”` : "none"} · {t.info.focal}</div>}
              <div className="truncate" title={meta?.titles[t.id].title}>Title: {titles[t.id] || meta?.titles[t.id].title || "—"}</div>
              <Checks c={t.checks} />
            </figcaption>
          </figure>
        ))}
      </div>) : undefined,
    preview: p.thumbs.some((t) => t.file) ? (
      <div className="grid gap-3">
        <div className="text-[12px] text-muted-foreground">Home feed as a viewer sees it, from the real images and your current titles (the duration badge covers the bottom-right corner). Light and dark theme, 360 px cards.</div>
        <div className="grid gap-3 overflow-x-auto">
          {p.thumbs.filter((t) => t.file).map((t) => (
            <div key={t.id} className="flex gap-0 overflow-hidden rounded-md border" style={{ width: "fit-content", maxWidth: "100%" }}>
              <FeedCard src={src(t)} title={titles[t.id]} dark={false} badge={p.badge} />
              <FeedCard src={src(t)} title={titles[t.id]} dark badge={p.badge} />
            </div>
          ))}
        </div>
        {p.previewSmall && <BlockFold title="Preview sheet: 320 px, 168 px, light and dark (what the critic sees)"><a href={file(p.previewSmall.path)} target="_blank" rel="noreferrer"><img src={`${file(p.previewSmall.path)}&v=${Math.round(p.previewSmall.mtime)}`} alt="Preview sheet" className="w-full rounded border" /></a></BlockFold>}
        {p.preview && <a className="text-xs text-brand" href={file(p.preview.path)} target="_blank" rel="noreferrer">Open preview.png (large) · rendered {ago(p.preview.mtime)}</a>}
      </div>) : undefined,
    review: <ReviewList reviews={p.reviews} toNotes={addNote} />,
    notes: (
      <div className="grid gap-3">
        {V.map((v) => (
          <TextEditor key={v} title={`Notes for ${v}`} sub={`07-publish/notes/${v}.md`} rows={5} draft={notes[v]}
            onSave={async (t) => { await api.savePublishNotes(ws, v, t); await refresh(); }}
            placeholder={"Thumbnail text is too small at 168 px.\nMove the cup out of the bottom-right corner."} />
        ))}
        <TextEditor title="Notes for the titles and description" sub="07-publish/notes/meta.md" rows={4} draft={noteM}
          onSave={async (t) => { await api.savePublishNotes(ws, "meta", t); await refresh(); }}
          placeholder="Make B less clickbaity. Mention the 2000-2025 data range in the first line." />
      </div>),
    fix: (
      <div className="grid gap-2">
        {p.thumbs.map((t) => {
          const open = pubNotesOpen(t, d), label = `Fix with notes ${t.id}`, running = busy?.label === label;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2.5 text-[12.5px]">
              <span className="w-24 font-mono">Variant {t.id}</span>
              <RunButton running={running} disabled={!!busy || !open || noteBusy(notes[t.id])} label="Fix with notes" onClick={() => runSaved("publish.fix", t.id)} />
              <span className="text-muted-foreground">{!t.notes.trim() ? "no notes" : open ? "notes open (save them first if you just typed)" : "notes applied"}</span>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px]">
          <span className="w-24">Titles</span>
          <RunButton running={busy?.label === "Titles & description"} disabled={!!busy || !p.metaNotes.trim() || pubMetaApplied(d, p.metaNotesMtime)} label="Revise with notes"
            onClick={() => void run("publish.meta", undefined, { notes: true })} />
          <span className="text-muted-foreground">{!p.metaNotes.trim() ? "no notes" : pubMetaApplied(d, p.metaNotesMtime) ? "notes applied" : "notes open"}</span>
        </div>
      </div>),
    approved: (
      <div className="grid gap-2">
        {p.stale.length > 0 && <Note>{p.stale.join(" · ")}</Note>}
        {blocking.length > 0 && <Note tone="danger">Fix before approving: {blocking.join("; ")}</Note>}
        <div className="flex flex-wrap items-center gap-2.5">
          {p.approval?.valid
            ? <><span className="text-xs text-muted-foreground">You approved these thumbnails and this metadata {ago(Date.parse(p.approval.at))}. Changing either cancels it.</span>
                <Button size="sm" disabled={working} onClick={() => act(() => api.unapprovePublish(ws))}>Remove approval</Button></>
            : <><Button size="sm" disabled={working || !meta || shown.length < 3 || blocking.length > 0} onClick={() => act(() => api.approvePublish(ws))}>Approve packages</Button>
                <span className="text-xs text-muted-foreground">Marks these three thumbnails with their titles as ready for Test & Compare. Check the facts first: figures from the narration alone are flagged above.</span></>}
        </div>
      </div>),
    export: p.exported.length ? (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {p.exported.map((f) => <a key={f.path} className="font-mono text-brand" href={file(f.path)} target="_blank" rel="noreferrer">{f.path.replace("07-publish/export/", "")}</a>)}
      </div>) : undefined,
  };
  return (
    <>
      <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />
      {lb !== null && <Enlarge items={shown} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
    </>
  );
}

/** A draft with unsaved typing: "Fix with notes" would send the old file. */
const noteBusy = (n: ReturnType<typeof useDraft>) => n.dirty;
