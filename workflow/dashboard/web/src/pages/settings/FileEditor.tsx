import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { NativeSelect, Textarea } from "@/components/ui/fields";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";

const group = (p: string) => (p.startsWith("workflow/prompts/") ? "Prompts" : p.startsWith("workflow/styles/") ? "Styles" : "Voice profile");

/** Prompts, house-style docs and the voice profile: pick a file, edit, save (the previous version is kept as <file>.prev). */
export function FileEditor() {
  const { toast } = useApp();
  const [files, setFiles] = useState<string[]>([]);
  const [sel, setSel] = useState("");
  const [orig, setOrig] = useState(""), [text, setText] = useState("");
  useEffect(() => { api.settingsFiles().then((r) => { const f = r.files.map((x) => x.path); setFiles(f); setSel((s) => s || f[0] || ""); }).catch((e) => toast(e.message)); }, [toast]);
  useEffect(() => { if (sel) api.settingsFile(sel).then((t) => { setOrig(t); setText(t); }).catch((e) => toast(e.message)); }, [sel, toast]);
  const dirty = text !== orig;
  const pick = (p: string) => { if (dirty && !window.confirm("Discard unsaved changes?")) return; setSel(p); };
  const save = async () => { try { await api.saveSettingsFile(sel, text); setOrig(text); toast(`Saved ${sel} (previous version: ${sel}.prev)`); } catch (e) { toast((e as Error).message); } };
  const groups = [...new Set(files.map(group))];
  return (
    <Card>
      <CardHeader><CardTitle>Prompts, styles and voice</CardTitle><CardSub className="hidden @xl:inline">{sel}</CardSub><span className="flex-1" />
        {dirty && <span className="text-xs text-warning">unsaved</span>}
        <Button size="sm" variant="default" disabled={!dirty} onClick={save}>Save</Button></CardHeader>
      <CardBody>
        <NativeSelect value={sel} onChange={(e) => pick(e.target.value)} aria-label="File">
          {groups.map((g) => <optgroup key={g} label={g}>{files.filter((f) => group(f) === g).map((f) => <option key={f} value={f}>{f.replace(/^workflow\//, "")}</option>)}</optgroup>)}
        </NativeSelect>
        <Textarea rows={26} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} aria-label="File contents" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirty) void save(); } }} />
        <div className="text-xs text-muted-foreground">These files steer Claude on the next run. Changes affect every video, so check the diff in git before committing.</div>
      </CardBody>
    </Card>
  );
}
