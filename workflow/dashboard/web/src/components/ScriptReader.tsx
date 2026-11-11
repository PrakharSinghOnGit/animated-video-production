import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Headphones, Pause, Play, Square } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/hooks/app";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/fields";
import { cn } from "@/lib/utils";

/**
 * The script as it will be heard: part titles and the spoken lines only. Tone notes (`[VO: …]`), on-screen hints,
 * clip labels and voice tags (<short pause>, <breath>) are dropped from the view; the file itself keeps them because
 * the voice uses the tone notes and the director uses the on-screen hints.
 *
 * Listen uses the browser's own speech (Web Speech API): free, instant, any voice the OS has. It is for reading by ear,
 * not a preview of the real voiceover. Click a paragraph to start from it.
 * Audio file: the same words as an .m4a made by macOS's `say` on the server (free, local): it keeps playing with the
 * phone locked, so a script can be reviewed while walking. Download it or play it here.
 */
/** macOS lists joke voices (Bells, Boing, Bubbles, …) as English; they sing or make noises, so they're never offered */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy|Fred|Junior|Ralph|Kathy)\b/;
type Part = { title: string; paras: { text: string; chunks: string[] }[] };

export function parseScript(raw: string): Part[] {
  const parts: Part[] = [];
  let cur: Part | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const head = line.match(/^#{1,4}\s+(.*)/);
    if (head) { cur = { title: head[1].replace(/\*+/g, "").trim(), paras: [] }; parts.push(cur); continue; }
    const vo = line.match(/^\*\*VO:\*\*\s*(?:`?\[(?:VO:\s*)?.*?\]`?)?\s*(.*)/i);
    if (!vo) continue;   // on-screen hints, clip labels, notes, blank lines
    const spoken = vo[1].replace(/^[`"]+|[`"]+$/g, "").trim();
    // a <short pause> splits the line so the listener hears the gap; other tags (<breath>, [laughs]) just go
    const chunks = spoken.split(/<\s*(?:short |long )?pause\s*>/i)
      .map((c) => c.replace(/<[^>]*>/g, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim())
      .flatMap(sentences).filter(Boolean);
    if (!chunks.length) continue;
    if (!cur) { cur = { title: "", paras: [] }; parts.push(cur); }
    cur.paras.push({ text: chunks.join(" "), chunks });
  }
  return parts.filter((p) => p.paras.length);
}

// one utterance per sentence: Chrome cuts long utterances off after ~15 s, and it makes stop/resume land cleanly
// ("..." is a beat inside the sentence, not an end)
function sentences(s: string) { return s.replace(/\.{3}/g, "…").match(/[\s\S]+?(?:[.!?]+["')\]]*(?=\s|$)|$)/g)?.map((x) => x.trim()) ?? [s]; }

// ALL-CAPS emphasis words (LOOKS, NEED) would be spelled out by some voices; short ones (AI, ETF, USD) stay as acronyms
const forSpeech = (s: string) => s.replace(/\b[A-Z]{4,}\b/g, (w) => w.toLowerCase()).replace(/\.\.\./g, "…");

const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const RATES = [0.9, 1, 1.1, 1.25, 1.4, 1.6];

export function ScriptReader({ raw, words }: { raw: string; words?: number }) {
  const parts = useMemo(() => parseScript(raw), [raw]);
  const flat = useMemo(() => parts.flatMap((p, pi) => p.paras.flatMap((para, ri) => para.chunks.map((c) => ({ key: `${pi}.${ri}`, text: c })))), [parts]);
  const can = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(store.get("wg.reader.voice") ?? "");
  const [rate, setRate] = useState(Number(store.get("wg.reader.rate")) || 1);
  const [at, setAt] = useState(0);              // index into flat
  const [playing, setPlaying] = useState(false);
  const token = useRef(0);
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!can) return;
    const load = () => setVoices(speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en") && !NOVELTY.test(v.name)));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
    return () => { speechSynthesis.removeEventListener("voiceschanged", load); speechSynthesis.cancel(); };
  }, [can]);
  // the best-sounding English voice the OS has, unless one was picked before
  const voice = voices.find((v) => v.name === voiceName)
    ?? voices.find((v) => /natural|premium|enhanced|neural/i.test(v.name))
    ?? voices.find((v) => /google/i.test(v.name)) ?? voices.find((v) => v.default) ?? voices[0];

  // speak the current sentence; its end moves to the next. A token makes callbacks of cancelled utterances harmless.
  useEffect(() => {
    if (!can || !playing) return;
    if (at >= flat.length) { setPlaying(false); setAt(0); return; }
    const my = ++token.current;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(flat[at].text));
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = rate;
    u.onend = () => { if (token.current === my) setAt((i) => i + 1); };
    u.onerror = (e) => { if (token.current === my && e.error !== "interrupted" && e.error !== "canceled") setPlaying(false); };
    speechSynthesis.speak(u);
  }, [can, playing, at, flat, voice, rate]);
  useEffect(() => { if (playing) activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [playing, flat[at]?.key]);
  // a new script (saved edit) starts over
  useEffect(() => { token.current++; if (can) speechSynthesis.cancel(); setPlaying(false); setAt(0); }, [raw, can]);

  const pause = () => { token.current++; speechSynthesis.cancel(); setPlaying(false); };
  const stop = () => { pause(); setAt(0); };
  const from = (key: string) => { const i = flat.findIndex((f) => f.key === key); if (i >= 0) { setAt(i); setPlaying(true); } };
  const activeKey = (playing || at > 0) ? flat[at]?.key : undefined;
  const mins = words ? ` · ${(words / 150).toFixed(1)} min at 150 wpm` : "";

  if (!parts.length) return <div className="text-xs text-muted-foreground">No spoken lines yet.</div>;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {can ? <>
          {playing
            ? <Button size="sm" onClick={pause}><Pause />Pause</Button>
            : <Button size="sm" variant="default" onClick={() => setPlaying(true)}><Play />{at > 0 ? "Resume" : "Listen"}</Button>}
          <Button size="sm" variant="ghost" onClick={stop} disabled={!playing && at === 0} aria-label="Stop and go back to the start"><Square className="size-3 fill-current" /></Button>
          <NativeSelect className="w-auto max-w-56 text-xs" aria-label="Voice" value={voice?.name ?? ""} onChange={(e) => { setVoiceName(e.target.value); store.set("wg.reader.voice", e.target.value); }}>
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </NativeSelect>
          <NativeSelect className="w-auto text-xs" aria-label="Speed" value={rate} onChange={(e) => { setRate(Number(e.target.value)); store.set("wg.reader.rate", e.target.value); }}>
            {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
          </NativeSelect>
        </> : <span className="text-xs text-muted-foreground">This browser has no built-in speech.</span>}
        <span className="text-[11px] text-subtle-foreground">browser voice, not the real voiceover · click a paragraph to start there{mins}</span>
      </div>
      <AudioFile parts={parts} rate={rate} />
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1 text-[14.5px] leading-[1.7]">
        {parts.map((p, pi) => (
          <section key={pi} className="grid gap-2">
            {p.title && <h4 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground" title="Part number for Write script → Only revise parts"><span className="mr-1.5 font-mono text-subtle-foreground">{pi + 1}</span>{p.title}</h4>}
            {p.paras.map((para, ri) => {
              const key = `${pi}.${ri}`, on = key === activeKey;
              return (
                <p key={key} ref={on ? activeRef : undefined} onClick={() => can && from(key)}
                  className={cn("m-0 max-w-[72ch] rounded-md px-2.5 py-1.5 transition-colors", can && "cursor-pointer hover:bg-accent", on && "bg-brand/10 ring-1 ring-brand/30")}>
                  {para.text}
                </p>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

/** The script as an audio file (macOS say on the dashboard's Mac): plays with the screen off, downloadable. */
function AudioFile({ parts, rate }: { parts: Part[]; rate: number }) {
  const { ws, toast } = useApp();
  const [voices, setVoices] = useState<{ name: string; lang: string }[] | null>(null);
  const [voice, setVoice] = useState(store.get("wg.reader.sayVoice") ?? "");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ url: string; bytes: number } | null>(null);
  useEffect(() => { api.listenVoices().then((r) => { setVoices(r.available ? r.voices : []); setVoice((v) => v || r.default); }).catch(() => setVoices([])); }, []);
  useEffect(() => setFile(null), [parts]);
  if (!ws || !voices?.length) return null;
  // part titles are read as headings, with a short silence between parts ([[slnc]] is a say command)
  const text = parts.map((p) => `${p.title ? `${p.title}.\n\n` : ""}${p.paras.map((x) => x.chunks.map(forSpeech).join(" ")).join("\n\n")}`).join("\n\n[[slnc 800]]\n\n");
  const make = async () => {
    setBusy(true);
    try { setFile(await api.listen(ws, text, voice, Math.round(180 * rate))); } catch (e) { toast((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Headphones className="size-4 text-muted-foreground" />
        <span className="text-[13px] font-medium">Audio file</span>
        <NativeSelect className="w-auto max-w-56 text-xs" aria-label="Audio file voice" value={voice} onChange={(e) => { setVoice(e.target.value); store.set("wg.reader.sayVoice", e.target.value); setFile(null); }}>
          {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
        </NativeSelect>
        <Button size="sm" variant={file ? "ghost" : "default"} disabled={busy} onClick={make}>{busy ? "Making…" : file ? "Make again" : "Make audio file"}</Button>
        {file && <Button size="sm" variant="ghost" asChild><a href={file.url} download={`${ws}_script.m4a`}><Download />Download ({(file.bytes / 1e6).toFixed(1)} MB)</a></Button>}
      </div>
      {file && <audio controls preload="metadata" src={file.url} className="w-full" />}
      <span className="text-[11px] text-subtle-foreground">Made on the Mac with its built-in voice (free, ~20–40 s for a script) at the speed picked above. Keeps playing with your phone locked: review while you walk.</span>
    </div>
  );
}
