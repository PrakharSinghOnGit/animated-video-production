import { useApp } from "@/hooks/app";
import { api } from "@/lib/api";
import { ago } from "@/lib/utils";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { TextEditor, useDraft } from "@/components/TextEditor";
import { Badge } from "@/components/ui/badge";

/** Counts of the page-check marks at the start of each fact line ("- ✓ **…**"). */
function marks(md: string) {
  const c = { "✓": 0, "~": 0, "✗": 0, "?": 0 };
  for (const m of md.matchAll(/^- ([✓~✗?]) /gm)) c[m[1] as keyof typeof c]++;
  return c;
}

/**
 * Web research (02-scripting/research.md): the Research and Re-check buttons, how many facts the page check confirmed,
 * and the file to read and edit. Used by the Script step and by a shorts project's brief.
 * `actions` = also show the Research button (the Script step carries it on its flow block instead).
 */
export function ResearchPanel({ actions = false }: { actions?: boolean }) {
  const { d, ws, refresh } = useApp();
  const draft = useDraft(d?.script.research ?? "");
  if (!d || !ws) return null;
  const r = d.script.research, c = marks(r);
  return (
    <div className="grid gap-2">
      {actions && <ActionGrid><ActionCard id="script.research" />{r.trim() && <ActionCard id="script.research.verify" />}</ActionGrid>}
      {!actions && r.trim() && <ActionGrid><ActionCard id="script.research.verify" /></ActionGrid>}
      {r.trim() ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone="success">✓ {c["✓"]} quote on its page</Badge>
            {c["~"] > 0 && <Badge tone="warning">~ {c["~"]} numbers only</Badge>}
            {c["✗"] > 0 && <Badge tone="danger">✗ {c["✗"]} not on the page</Badge>}
            {c["?"] > 0 && <Badge tone="neutral">? {c["?"]} page unreadable</Badge>}
            {d.script.researchInfo && <span className="text-muted-foreground">{ago(d.script.researchInfo.mtime)}</span>}
          </div>
          <TextEditor title="Research" sub="02-scripting/research.md" rows={14} draft={draft} spellCheck
            hint={<>Only <b>✓</b> facts count as sourced (the program found the quoted sentence on the page). <b>?</b> pages could not be read (paywall, bot block, or a link that does not exist): open them yourself. Delete what you don't trust; a fact you checked by hand can start with ✓.</>}
            onSave={async (t) => { await api.saveText(ws, "research", t); await refresh(); }} />
        </>
      ) : <div className="text-xs text-muted-foreground">No research yet.</div>}
    </div>
  );
}
