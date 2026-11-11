/**
 * Commands (allowlist + typed options): the client sends an action key and options, the server validates them against
 * the action's schema and builds the argv. This file holds the types, the option sets several steps share, the registry
 * and the validation; the actions themselves are one file per step (script.ts, voice.ts, …), registered in index.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { allSpecs, parseSpec, roleModel, PROVIDERS, ROLES, type RoleKey } from "../../../lib/models";
import * as sh from "../../../08-shorts/lib";
import { ACT_ID, REPO, actIds, exists, ls, mtime, readJson, wsDir } from "../core";
import { actStale, sceneFiles } from "../status";

// ───────────────────────────── commands (allowlist + typed options) ─────────────────────────────

export const B = (script: string, ...rest: string[]) => ["bun", "run", script, ...rest];

/** Master voice: options not given fall back to the last run's (06-audio/master.json), like Speed & gaps does. */
export function masterOpts(ws: string, o: Record<string, any>): Record<string, any> {
  const last = readJson<any>(path.join(wsDir(ws), "06-audio/master.json"))?.options ?? {};
  const pick = (k: string) => (o[k] !== undefined && o[k] !== "" ? o[k] : last[k]);
  return { targetLufs: pick("targetLufs"), highpass: pick("highpass"), deess: pick("deess"), ratio: pick("ratio"), threshold: pick("threshold"), noRoomTone: o.noRoomTone ?? (last.roomTone === false) };
}

/** One option of an action. The client renders a control per option; the server validates and maps it to argv. */
export interface Opt {
  key: string; label: string; help?: string;
  type: "select" | "number" | "bool" | "text" | "multi";
  choices?: string[]; def?: string | number | boolean | string[];
  min?: number; max?: number; step?: number;
  /** never remembered between sessions: always starts at its default (destructive switches) */
  volatile?: boolean;
  /** argv for a value (bool: only when true) */
  flag?: string; map?: (v: any) => string[];
  /** model picker for this agent step: choices = "default" + every model the step can use (dynamic) */
  role?: RoleKey;
  /** only shown (and only passed) while another option has one of these values, e.g. Gemini's voice while engine = gemini */
  when?: { key: string; in: string[] };
}
export interface Action {
  step: string; label: string; help: string;
  paid?: string;           // e.g. "~$3"
  perAct?: boolean;        // needs an act id
  perShort?: boolean;      // needs a short id (S1..), passed as the act; must be in the video's shorts
  variant?: boolean;       // needs a thumbnail variant (A/B/C), passed as the act
  long?: string;           // typical duration
  opts?: Opt[];
  /** Master buttons: the commands this action runs, in order (same order as build()). `action` = another button that runs that command alone. */
  chain?: { label: string; action?: string }[];
  build: (ws: string, o: Record<string, any>, act?: string) => string[][] | string;
}
export const styles = () => ls(path.join(REPO, "workflow/styles")).filter((d) => exists(path.join(REPO, "workflow/styles", d, "STYLE.md")));

/** Final render: resolution (upscaled above 1080p) and which audio goes in the file. */
export const TABS_OPT: Opt = { key: "concurrency", label: "Parallel render tabs", help: "auto = half the CPU cores; fewer uses less memory (if a render crashes) but takes longer", type: "select", choices: ["auto", "2", "3", "4", "6"], def: "auto", flag: "--concurrency",
  map: (v) => (v === "auto" ? [] : ["--concurrency", String(v)]) };
/** The draft inside a chain gets the same tab count (validated against the choices). */
export const tabs = (o: Record<string, any>): string[] => { const v = String(o.concurrency ?? "auto"); if (!TABS_OPT.choices!.includes(v)) throw new Error(`Parallel render tabs: "${v}" is not offered`); return TABS_OPT.map!(v as any); };
export const FINAL_OPTS: Opt[] = [
  { key: "res", label: "Resolution", help: "1440p and 4K are upscaled from the 1080p render", type: "select", choices: ["1080", "1440", "2160"], def: "1080", flag: "--res" },
  { key: "audio", label: "Audio", help: "mix = voice + foley (+ music if mixed in); none skips QC's loudness check", type: "select", choices: ["mix", "voice", "none"], def: "mix", flag: "--audio" },
  TABS_OPT,
];

/** Voice (03-voiceover): Qwen3-TTS clones the channel voice (voices/ACTIVE) locally; Gemini is optional cloud TTS. */
export const GEMINI_VOICES = ["Algenib", "Charon", "Orus", "Iapetus", "Fenrir", "Enceladus", "Alnilam", "Schedar", "Rasalgethi", "Sadaltager", "Gacrux", "Kore", "Puck", "Zephyr", "Leda", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Laomedeia", "Achernar", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sulafat", "Umbriel", "Algieba"];
export const GEMINI_ONLY = { key: "engine", in: ["gemini"] };
export const VOICES = path.join(REPO, "workflow/03-voiceover/voices");
export const activeVoice = () => { try { return fs.readFileSync(path.join(VOICES, "ACTIVE"), "utf-8").trim(); } catch { return ""; } };
/** Cloneable voices (picked reference), read on every schema/run so new ones show up without a restart. */
export const voiceProfiles = () => ["channel voice", ...ls(VOICES).filter((d) => exists(path.join(VOICES, d, "reference.wav"))), ...(exists(path.join(REPO, "workflow/03-voiceover/voice_profile/reference.wav")) ? ["legacy"] : [])];
export const geminiDesigned = () => ls(VOICES).filter((d) => exists(path.join(VOICES, d, "gemini.json")));
/** Models a step can use: write steps skip providers that cannot edit files. */
export const roleChoices = (role: RoleKey) => ["default", ...allSpecs().filter((s) => !ROLES[role].edits || PROVIDERS[parseSpec(s).provider].edits), ...(role === "critic" ? ["off"] : [])];
/** Music & beat: keep the chosen track, no track, or any library track (assets/music/index.json). */
export const beatTracks = () => { try { return ["keep", "none", ...JSON.parse(fs.readFileSync(path.join(REPO, "assets/music/index.json"), "utf-8")).tracks.map((t: any) => String(t.file))]; } catch { return ["keep", "none"]; } };
export const dynChoices = (o: Opt) => (o.role ? roleChoices(o.role) : o.key === "beatTrack" ? beatTracks() : o.key === "voiceProfile" ? voiceProfiles() : o.key === "voice" ? [...geminiDesigned(), ...GEMINI_VOICES] : o.choices);
export const dynHelp = (o: Opt) => (o.role ? `default = ${roleModel(o.role)} (Settings → Models)` : o.help);
export const ENGINE_OPTS: Opt[] = [
  { key: "engine", label: "Engine", help: "gemini: Google voices, each block read whole with its tone note as direction (free tier with an AI Studio key) · qwen: local, free, the cloned channel voice. Default: TTS_ENGINE in .env", type: "select", choices: ["gemini", "qwen"], def: process.env.TTS_ENGINE?.trim() === "qwen" ? "qwen" : "gemini", map: (v) => ["--engine", v] },
  { key: "voiceProfile", label: "Voice", help: "channel voice = voices/ACTIVE (bun run voice:use); others for a test", type: "select", choices: ["channel voice"], def: "channel voice", map: (v) => (v === "channel voice" ? [] : ["--voice-profile", v]), when: { key: "engine", in: ["qwen"] } },
  { key: "voice", label: "Gemini voice", type: "select", choices: GEMINI_VOICES, def: "Algenib", flag: "--voice", when: GEMINI_ONLY },
  { key: "parallel", label: "Requests at once", help: "Gemini passages generated in parallel (lower it if you hit rate limits)", type: "number", min: 1, max: 12, step: 1, flag: "--parallel", when: GEMINI_ONLY },
  { key: "geminiModel", label: "Gemini model", type: "select", choices: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-pro-tts", "gemini-3.1-flash-tts-preview"], def: "gemini-3.8-flash-tts", flag: "--gemini-model", when: GEMINI_ONLY },
];

/** A model picker tied to an agent step (workflow/lib/models.ts): "default" = Settings → Models; every discovered model otherwise. */
/** Align all (merge → transcribe → master with the last used settings → captions → move the plan → pause points). */
export function alignAll(ws: string, o: Record<string, any> = {}) {
  return [B("tts:post", "--video", ws), B("transcribe", "--video", ws), B("audio:master", "--video", ws, ...args(masterOpts(ws, {}), "align.master")), B("captions", "--video", ws), B("voice:holds", "--video", ws, "--shift-plan"), B("replan", "--video", ws, "--auto"), B("voice:holds", "--video", ws, "--scan")];
}
export function modelOpt(role: RoleKey, label: string, flag: string, key = "model"): Opt {
  return { key, label, type: "select", choices: ["default"], def: "default", role, map: (v) => (v === "default" ? [] : [flag, v]) };
}
export const CRITIC_OPT: Opt = { ...modelOpt("critic", "Critic", "--critic", "critic"), map: (v) => (v === "off" ? ["--no-critic"] : v === "default" ? [] : ["--critic", v]) };

/** Mix options shared by Mix and Apply SFX edits (long video). */
export const SOUND_MIX_OPTS: Opt[] = [
  { key: "withMusic", label: "Include music", type: "bool", def: false, flag: "--with-music" },
  { key: "duckDb", label: "Music duck (dB)", type: "number", min: -30, max: 0, step: 1, flag: "--duck-db" },
  { key: "musicDb", label: "Music level (dB)", type: "number", min: -30, max: 6, step: 1, flag: "--music-db" },
  { key: "foleyDb", label: "Foley level (dB)", type: "number", min: -20, max: 10, step: 1, flag: "--foley-db" },
  { key: "noLib", label: "Procedural foley only", type: "bool", def: false, flag: "--no-lib" },
];

export const SHORT_STAGES = ["voice", "align", "beat", "plan", "act", "sound", "draft", "render"] as const;

/** Every runnable thing: action key → how to build its argv chain. Filled by index.ts in the order the page lists them. */
export const ACTIONS: Record<string, Action> = {};

/** "A03" -> "A03-A04" (the seam into the next act in timeline order), or "" for the last act. */
export function seamAfter(ws: string, act: string): string {
  const ids = actIds(ws), i = ids.indexOf(act);
  return i >= 0 && i < ids.length - 1 ? `${act}-${ids[i + 1]}` : "";
}

/** Validate client options against an action's schema and turn them into argv. Unknown keys are ignored. */
export let currentOpts: Record<string, any> = {};
export function args(o: Record<string, any>, key: string): string[] {
  const out: string[] = [];
  const defs = ACTIONS[key].opts ?? [];
  const valueOf = (k: string) => o[k] ?? defs.find((d) => d.key === k)?.def;
  for (const opt of defs) {
    if (opt.when && !opt.when.in.includes(String(valueOf(opt.when.key)))) continue;
    let v = o[opt.key] ?? opt.def;
    if (v === undefined || v === null || v === "") continue;
    switch (opt.type) {
      case "bool": if (v === true || v === "true") out.push(...(opt.map ? opt.map(true) : [opt.flag!])); continue;
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`${opt.label}: not a number`);
        if ((opt.min !== undefined && n < opt.min) || (opt.max !== undefined && n > opt.max)) throw new Error(`${opt.label}: ${opt.min}–${opt.max}`);
        out.push(...(opt.map ? opt.map(n) : [opt.flag!, String(n)]));
        continue;
      }
      case "select":
        // an old saved model name without its provider ("sonnet" from before provider:model) means Claude's
        if (!(dynChoices(opt) ?? []).includes(String(v)) && (dynChoices(opt) ?? []).includes(`claude:${v}`)) v = `claude:${v}`;
        if (!(dynChoices(opt) ?? []).includes(String(v))) throw new Error(`${opt.label}: "${v}" is not offered any more (pick again; offered: ${(dynChoices(opt) ?? []).slice(0, 8).join(", ")})`);
        out.push(...(opt.map ? opt.map(String(v)) : [opt.flag!, String(v)]));
        continue;
      case "multi": {
        const arr = (Array.isArray(v) ? v : []).map(String);
        const allowed = (key === "acts.all" || key === "acts.reviewAll") && opt.key === "acts" ? currentOpts.__acts ?? [] : opt.choices ?? [];
        const unknown = arr.filter((x) => !allowed.includes(x));
        if (unknown.length) throw new Error(`${opt.label}: ${unknown.join(", ")} ${unknown.length > 1 ? "are" : "is"} not offered any more (pick again)`);
        out.push(...(opt.map ? opt.map(arr) : arr.length ? [opt.flag!, arr.join(",")] : []));
        continue;
      }
      case "text": {
        const s = String(v).trim();
        if (!s) continue;
        if (s.length > (opt.key === "models" ? 2000 : opt.key === "notes" ? 1500 : 300) || s.startsWith("-") || /[\0\n\r]/.test(s)) throw new Error(`${opt.label}: invalid text`);
        if (opt.key === "models" && !/^([A-Z]\d+=[\w:./@-]+)(,[A-Z]\d+=[\w:./@-]+)*$/.test(s)) throw new Error("Per-act models: A01=claude:sonnet,A02=opus");
        if (opt.key === "at" && !/^[\d.,\s]+$/.test(s)) throw new Error("Extra times: numbers separated by commas");
        if (opt.key === "only" && !/^[\w,]+$/.test(s)) throw new Error("Items: keys separated by commas");
        if (opt.key === "section" && !/^[\w-]+$/.test(s)) throw new Error("Section id: letters, digits, _ and -");
        out.push(opt.flag!, s);
      }
    }
  }
  return out;
}

/**
 * What a job writes, so the dashboard can run jobs side by side: one act's jobs (author, frames, preview, review, fix)
 * lock that act; the batch actions lock the acts they will touch; everything else locks the whole video ("*").
 */
export function locksFor(ws: string, key: string, opts: Record<string, any>, act?: string): string[] {
  const a = ACTIONS[key];
  if (a.step === "acts" && a.perAct && act) return [`act:${act}`];
  if (key === "acts.all" || key === "acts.reviewAll") {
    const picked: string[] = Array.isArray(opts.acts) ? opts.acts.map(String) : [];
    if (picked.length) return picked.map((x) => `act:${x}`);
    if (key === "acts.reviewAll") return actIds(ws).filter((id) => sceneFiles(ws)[id]).map((x) => `act:${x}`);
    // no pick: every act without a file, plus (as the author does) acts whose plan changed; with "redo", all acts
    const scenes = sceneFiles(ws);
    const ids = opts.force ? actIds(ws) : actIds(ws).filter((id) => !scenes[id] || actStale(ws, id, mtime(path.join(wsDir(ws), scenes[id]))));
    return ids.length ? ids.map((x) => `act:${x}`) : ["*"];
  }
  return ["*"];
}

export function commandFor(ws: string, key: string, opts: Record<string, any>, act?: string): { label: string; key: string; cmds: string[][]; locks: string[] } | string {
  const a = ACTIONS[key];
  if (!a) return "unknown action";
  if (a.perAct && (!act || !ACT_ID.test(act) || !actIds(ws).includes(act))) return "unknown act";
  if (a.variant && !(act && /^[ABC]$/.test(act))) return "unknown variant";
  if (a.perShort && (!act || !sh.SHORT_ID.test(act) || !sh.listShorts(ws).includes(act))) return "unknown short";
  currentOpts = { __acts: actIds(ws) };
  let cmds: string[][] | string;
  try { cmds = a.build(ws, opts ?? {}, act); } catch (e: any) { return e.message; }
  if (typeof cmds === "string") return cmds;
  const jobKey = a.variant ? `${a.step}:${act}` : a.perAct ? `${key.split(".")[1]}:${act}` : a.step;   // shorts jobs all use the step key "shorts"
  return { key: jobKey, label: a.perAct || a.variant || a.perShort ? `${a.label} ${act}` : a.label, cmds, locks: locksFor(ws, key, opts ?? {}, act) };
}

export function schema() {
  return Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, { step: a.step, label: a.label, help: a.help, paid: a.paid ?? null, long: a.long ?? null, perAct: !!a.perAct || !!a.variant || !!a.perShort, chain: a.chain ?? null, opts: (a.opts ?? []).map(({ map, flag, ...o }) => ({ ...o, choices: dynChoices(o as Opt), help: dynHelp(o as Opt) })) }]));
}
