import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Pause, RefreshCw } from "lucide-react";
import { useApp } from "@/hooks/app";
import { useRunWith } from "@/hooks/useRunSaved";
import { Flow, BlockFold, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { api } from "@/lib/api";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Empty, Note } from "@/components/FileLine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/fields";
import { RunButton } from "@/components/RunButton";
import { useStored } from "@/lib/storage";
import { ago, cn } from "@/lib/utils";
import type { VoiceReview, VoiceSection } from "@/lib/types";

const PAUSE_NOTE = (s: VoiceSection) => s.pauses.map((p) => `${p.dur.toFixed(1)} s pause at ${p.at.toFixed(1)} s`).join(", ");

/** One section in Listen: the take, its text, long pauses, and "Add to review". */
function SectionRow({ s, onAdd }: { s: VoiceSection; onAdd: (s: VoiceSection) => void }) {
  if (!s.file) return null;
  return (
    <div className={cn("grid gap-1.5 border-b border-border/60 py-2.5 last:border-0", s.review && "opacity-80")}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-mono">{s.id}</span>
        {s.pauses.map((p, i) => <Badge key={i} tone="warning" title="Silence inside the take"><Pause className="size-3" />{p.dur.toFixed(1)} s at {p.at.toFixed(1)} s</Badge>)}
        {s.wer != null && s.wer > 0.08 && <Badge tone="warning" title="Speech recognition found other words than the script">{Math.round(s.wer * 100)}% words off</Badge>}
        {s.review ? <Badge tone={s.review.status === "open" ? "warning" : "success"}>{s.review.status === "open" ? "in review" : "regenerated: listen again"}</Badge>
          : <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onAdd(s)}><MessageSquarePlus />Add to review</Button>}
      </div>
      <MediaPlayer f={s.file} kind="audio" label={s.id} />
      <div className="line-clamp-2 text-[12px] text-muted-foreground" title={s.text}>{s.text}</div>
    </div>
  );
}

/** One section in Review: both takes, what to change, the direction Gemini gets, and regenerate. */
function ReviewCard({ s, r, onChange, onRemove, onRedo, canRedo, gemini }: {
  s: VoiceSection; r: VoiceReview; onChange: (r: VoiceReview) => void; onRemove: () => void; onRedo: () => void; canRedo: boolean; gemini: boolean;
}) {
  const [showDir, setShowDir] = useState(!!r.direction);
  const sent = `${(r.direction?.trim() || s.direction).replace(/\.?\s*$/, "")}${r.note.trim() ? `. Fix from the previous take: ${r.note.trim().replace(/\.?\s*$/, "")}.` : "."}`;
  return (
    <div className="grid gap-2.5 rounded-lg border bg-raised/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-semibold">{s.id}</span>
        <Badge tone={r.status === "open" ? "warning" : "success"}>{r.status === "open" ? "waiting for a new take" : `regenerated ${r.regeneratedAt ? ago(Date.parse(r.regeneratedAt)) : ""}`}</Badge>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {r.status === "regenerated" && <Button size="sm" onClick={() => onChange({ ...r, status: "open" })}>Still wrong</Button>}
          <Button size="sm" onClick={onRemove}>{r.status === "regenerated" ? "Good now: done" : "Remove"}</Button>
          <Button size="sm" variant="default" disabled={!canRedo} onClick={onRedo}><RefreshCw />Regenerate this</Button>
        </span>
      </div>
      <div className="text-[12.5px] leading-relaxed">{s.text}</div>
      {s.file && <MediaPlayer f={s.file} kind="audio" label={s.prev ? "current take" : s.id} />}
      {s.prev && <MediaPlayer f={s.prev} kind="audio" label="previous take" />}
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">What to change {s.pauses.length > 0 && <span className="text-warning">· found: {PAUSE_NOTE(s)}</span>}</span>
        <Textarea rows={2} value={r.note} onChange={(e) => onChange({ ...r, note: e.target.value })}
          placeholder="e.g. no laughing on “free money”; no pause after “the market”; slower and drier" />
      </label>
      {gemini ? (
        <div className="grid gap-1 text-xs">
          <button type="button" className="justify-self-start text-brand hover:underline" onClick={() => setShowDir(!showDir)}>{showDir ? "Hide" : "Show / edit"} the direction Gemini gets</button>
          {showDir && (
            <>
              <Textarea rows={3} value={r.direction ?? ""} onChange={(e) => onChange({ ...r, direction: e.target.value })} placeholder={s.direction} />
              <span className="text-subtle-foreground">Empty = the usual one (shown greyed: channel style + this block's [VO: …] note). Sent with the next take:</span>
              <code className="whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11.5px]">{sent}</code>
            </>
          )}
        </div>
      ) : <span className="text-[11px] text-subtle-foreground">This voice was made with Qwen, which takes no direction: regenerating gives a fresh take; switch the engine to Gemini in the options to use the note.</span>}
    </div>
  );
}

export function VoiceStep() {
  const { d, ws, refresh, toast, canRun } = useApp();
  const runWith = useRunWith();
  const [onlyFlagged, setOnlyFlagged] = useStored<boolean>("voice.onlyFlagged", false);
  // local copy of review.json while you type; saved shortly after each change
  const server = useMemo(() => Object.fromEntries((d?.voice.sections ?? []).filter((s) => s.review).map((s) => [s.id, s.review!])), [d?.voice.sections]);
  const [rv, setRv] = useState<Record<string, VoiceReview>>(server);
  const [dirty, setDirty] = useState(0);
  useEffect(() => { if (!dirty) setRv(server); }, [server, dirty]);
  useEffect(() => {
    if (!dirty || !ws) return;
    const t = setTimeout(async () => { try { await api.saveVoiceReview(ws, rv); setDirty(0); await refresh(); } catch (e) { toast((e as Error).message); } }, 600);
    return () => clearTimeout(t);
  }, [dirty, rv, ws, refresh, toast]);
  if (!d) return null;
  const v = d.voice;
  const update = (n: Record<string, VoiceReview>) => { setRv(n); setDirty((x) => x + 1); };
  const add = (s: VoiceSection) => update({ ...rv, [s.id]: { note: s.pauses.length ? `Remove the long pause (${PAUSE_NOTE(s)}).` : "", status: "open", at: new Date().toISOString() } });
  const sections = v.sections.length ? v.sections : [];
  const flagged = sections.filter((s) => s.pauses.length || (s.wer ?? 0) > 0.08);
  const shown = onlyFlagged ? flagged : sections;
  const inReview = sections.filter((s) => rv[s.id]);
  const gemini = (v.engine ?? "gemini") === "gemini";
  const redo = async (id?: string) => { if (dirty && ws) { await api.saveVoiceReview(ws, rv); setDirty(0); } await runWith("voice.redo", undefined, id ? { section: id } : {}); };
  const spec = stepSpec("voice", d);
  const parts = [...new Set(shown.map((s) => s.part))];

  const kids: Record<string, React.ReactNode> = {
    sections: <div className="text-xs text-muted-foreground">{v.sectionCount ? `${v.sectionCount} sections` : "No sections yet: finish the Script step."}</div>,
    gen: v.running ? <div className="text-xs text-warning">{v.freshWavs}/{v.sectionCount} sections done this run</div> : undefined,
    listen: (
      <>
        {!v.parts.some((p) => p.files.length) && <Empty>Not generated yet.</Empty>}
        {v.parts.some((p) => p.files.length) && !v.scanned && (
          <Note>This voice was made before pause detection. Scan it once to list every section with its text, direction and long pauses.
            <div className="mt-2"><RunButton label="Scan for long pauses" disabled={!canRun("voice.scan")} onClick={() => void runWith("voice.scan")} /></div></Note>
        )}
        {v.scanned && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{flagged.length} of {sections.length} sections flagged (pause over 0.9 s inside, or words off) · {inReview.length} in review</span>
            <Button size="sm" variant={onlyFlagged ? "default" : "ghost"} aria-pressed={onlyFlagged} onClick={() => setOnlyFlagged(!onlyFlagged)}>Only flagged</Button>
            {flagged.some((s) => !rv[s.id]) && <Button size="sm" variant="ghost" onClick={() => update({ ...rv, ...Object.fromEntries(flagged.filter((s) => !rv[s.id]).map((s) => [s.id, { note: s.pauses.length ? `Remove the long pause (${PAUSE_NOTE(s)}).` : "Read every word of the script.", status: "open" as const, at: new Date().toISOString() }])) })}>Add all flagged to review</Button>}
            <span className="w-full text-[11px] text-subtle-foreground">Many short stalls? Align → Merge can also cap every pause inside a take (Longest pause), no regeneration needed.</span>
          </div>
        )}
        {v.scanned ? parts.map((p) => {
          const rows = shown.filter((s) => s.part === p), first = rows[0];
          return (
            <BlockFold key={p} defaultOpen={onlyFlagged} title={`Part ${p}${first?.partTitle ? ` · ${first.partTitle}` : ""} · ${rows.length} sections${rows.some((s) => s.pauses.length) ? ` · ${rows.filter((s) => s.pauses.length).length} with long pauses` : ""}`}>
              <div className="pb-2">{rows.map((s) => <SectionRow key={s.id} s={{ ...s, review: rv[s.id] ?? null }} onAdd={add} />)}</div>
            </BlockFold>
          );
        }) : v.parts.map((p) => (
          <BlockFold key={p.part} title={`${p.part.replace("part-", "Part ")} · ${p.files.length} sections`}>
            <div className="grid gap-2 pb-3">{p.files.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" />)}</div>
          </BlockFold>
        ))}
      </>),
    review: inReview.length ? (
      <div className="grid gap-3">
        {inReview.map((s) => (
          <ReviewCard key={s.id} s={s} r={rv[s.id]} gemini={gemini} canRedo={canRun("voice.redo")}
            onChange={(r) => update({ ...rv, [s.id]: r })}
            onRemove={() => { const n = { ...rv }; delete n[s.id]; update(n); }}
            onRedo={() => void redo(s.id)} />
        ))}
        <span className="text-[11px] text-subtle-foreground">The block's Run regenerates every section waiting for a new take. Afterwards run Align (Merge first) so the full voiceover uses the new takes.</span>
      </div>
    ) : <span className="text-xs text-muted-foreground">Nothing in review. In Listen, use “Add to review” on a section that sounds wrong.</span>,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
