import { useEffect, useRef, useState } from "react";
import { Eye, PencilLine } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { Segmented } from "@/components/ui/layout";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";
import { useApp } from "@/hooks/app";

/** Server text -> editable draft. The draft is only replaced by the server's copy while the user has not typed. */
export function useDraft(server: string) {
  const [v, setV] = useState(server);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setV(server); }, [server, dirty]);
  return { v, dirty, set: (x: string) => { setV(x); setDirty(true); }, append: (x: string) => { setV((p) => (p.trim() ? p.replace(/\s*$/, "\n") : "") + x); setDirty(true); }, saved: (x?: string) => { if (x !== undefined) setV(x); setDirty(false); } };
}

export function TextEditor({ title, sub, rows, placeholder, hint, draft, onSave, taRef, extra, spellCheck = false }: {
  title: string; sub?: string; rows: number; placeholder?: string; hint?: React.ReactNode;
  draft: ReturnType<typeof useDraft>; onSave: (text: string) => Promise<void>; taRef?: React.Ref<HTMLTextAreaElement>; extra?: React.ReactNode; spellCheck?: boolean;
}) {
  const { toast } = useApp();
  const local = useRef<HTMLTextAreaElement>(null);
  const isMd = !!sub && /\.md\b/.test(sub);
  const [view, setView] = useState<"write" | "preview">("write");
  const save = async () => {
    try { await onSave(draft.v); draft.saved(); toast(`${title} saved`); } catch (e) { toast((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {sub && <CardSub className="hidden font-mono text-[11px] @xl:inline">{sub}</CardSub>}
        <span className="flex-1" />
        {draft.dirty && <span className="flex items-center gap-1.5 text-xs text-warning"><span className="size-1.5 rounded-full bg-warning" />Unsaved</span>}
        {extra}
        {isMd && <Segmented label={`${title} view`} value={view} onChange={setView} className="h-7" options={[{ value: "write", label: <span className="max-sm:sr-only">Write</span>, icon: <PencilLine /> }, { value: "preview", label: <span className="max-sm:sr-only">Preview</span>, icon: <Eye /> }]} />}
        <Button size="sm" variant={draft.dirty ? "default" : "secondary"} onClick={save} disabled={!draft.dirty}>Save</Button>
      </CardHeader>
      <CardBody>
        {view === "preview" && isMd ? (
          <div className="min-h-24 overflow-auto rounded-md border bg-background px-4 py-3" style={{ maxHeight: `${Math.max(rows, 6) * 1.65 + 1.5}rem` }}>
            {draft.v.trim() ? <Markdown>{draft.v}</Markdown> : <span className="text-xs text-subtle-foreground">Nothing written yet.</span>}
          </div>
        ) : <Textarea
          ref={(el) => { (local as { current: HTMLTextAreaElement | null }).current = el; if (typeof taRef === "function") taRef(el); else if (taRef) (taRef as { current: HTMLTextAreaElement | null }).current = el; }}
          rows={rows} value={draft.v} placeholder={placeholder} spellCheck={spellCheck}
          onChange={(e) => draft.set(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void save(); } }}
        />}
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardBody>
    </Card>
  );
}
