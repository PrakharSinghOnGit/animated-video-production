/**
 * Learning from review notes: every "Fix with notes" also teaches the act prompt, once a mistake repeats.
 *
 * 1. A cheap model (role `notesLearner`, default claude:haiku) reads the new notes of a fix round and pulls out only the
 *    GENERAL rules in them ("the last frame must be settled and clear for the transition"), not the act-specific
 *    fixes ("move the logo left"). Each rule is matched against the observations seen so far.
 * 2. `workflow/learning/observations.json` (in git) counts each rule: which videos/acts it came up on, with the words.
 * 3. When a rule has come up on 2 different acts it becomes a *proposed* lesson for ACT.md (SHORT_ACT.md for shorts) in
 *    lessons.json, with the notes as evidence. You approve, edit or reject it (dashboard: Analytics → Lessons); only an
 *    approved lesson reaches the prompt. Later repeats add evidence to that lesson (an active lesson that keeps
 *    being broken shows it). A rejected lesson is not proposed again.
 *
 * Usage: bun run learn --video <ID> --act A03 --notes <file>     (author_act runs this after each fix with notes)
 *        bun run learn --backfill [--model <spec>]               (every director_notes.md in workspace/, once)
 * Each note bullet is learned once (hashed), so re-sending the same notes file costs nothing.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO, propose, addEvidence, readStore, type Target, type Evidence } from "./lessons";

export const OBS_FILE = process.env.WG_OBS_FILE ?? path.join(REPO, "workflow/learning/observations.json");
/** distinct acts a rule must come up on before it is proposed as a lesson */
export const PROPOSE_AT = 2;

export interface Hit { video: string; act: string; quote: string; at: string }
export interface Observation { id: string; target: Target; rule: string; hits: Hit[]; lesson?: string }
interface ObsStore { seen: string[]; observations: Observation[] }

function readObs(): ObsStore {
  try { const s = JSON.parse(fs.readFileSync(OBS_FILE, "utf-8")); return { seen: s.seen ?? [], observations: s.observations ?? [] }; } catch { return { seen: [], observations: [] }; }
}
function writeObs(s: ObsStore) {
  const tmp = `${OBS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, OBS_FILE);
}

/** The notes split into items (bullets, or paragraphs when there are none), without review headers. */
export function noteItems(text: string): string[] {
  const lines = text.split("\n");
  const items: string[] = [];
  let cur = "";
  const push = () => { if (cur.trim()) items.push(cur.trim()); cur = ""; };
  for (const l of lines) {
    if (/^#{1,6}\s/.test(l)) { push(); continue; }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) { push(); cur = l.replace(/^\s*([-*]|\d+[.)])\s+/, ""); continue; }
    if (!l.trim()) { push(); continue; }
    cur += (cur ? " " : "") + l.trim();
  }
  push();
  return items.filter((x) => x.length > 12);
}
const hashOf = (s: string) => crypto.createHash("sha1").update(s.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex").slice(0, 16);

function extractPrompt(target: Target, items: string[], known: Observation[]): string {
  return `You help an animation pipeline learn from its creator's review notes. Below are new review notes on ONE animated act of a finance explainer video (canvas animation drawn by an AI author; acts flow into each other with transitions).

Pull out only GENERAL rules: craft mistakes that would apply to other acts and videos too (transitions and first/last frames, text size and legibility, pacing and holds, timing of hits to words, clutter, camera, composition, colour contrast, things left on screen, empty frames...).
Skip anything specific to this act's content ("make the right strip longer", "put LIQUIDITY TAKEN by the wick", "fine, keep it"): those are fixes, not lessons. Most notes have no general rule; returning few or none is normal.

Write each rule as one short imperative sentence for the animator (max 30 words), general enough to apply anywhere, concrete enough to check on a frame.
If a rule is the same idea as one of the known rules below, give its id in "same_as" (don't create near-duplicates).

Known rules (${target}):
${known.length ? known.map((o) => `${o.id}: ${o.rule}`).join("\n") : "(none yet)"}

New notes:
${items.map((x, i) => `[${i + 1}] ${x.slice(0, 900)}`).join("\n")}

Reply with ONLY this JSON: {"items":[{"rule":"...","same_as":"O003 or null","note":1,"quote":"the few words of the note it came from"}]}`;
}

export interface LearnResult { newItems: number; rules: { id: string; rule: string; count: number; isNew: boolean }[]; proposed: string[]; evidence: string[]; costUsd: number }

/**
 * Learn from one act's notes. `run` calls the model (injected so this module stays free of the agent runner).
 */
export async function learnFromNotes(o: { video: string; act: string; notes: string; target: Target; run: (prompt: string) => Promise<{ text: string; costUsd: number }> }): Promise<LearnResult> {
  const res: LearnResult = { newItems: 0, rules: [], proposed: [], evidence: [], costUsd: 0 };
  const store = readObs();
  const seen = new Set(store.seen);
  const fresh = noteItems(o.notes).filter((x) => !seen.has(hashOf(x)));
  res.newItems = fresh.length;
  if (!fresh.length) return res;

  const known = store.observations.filter((x) => x.target === o.target).sort((a, b) => b.hits.length - a.hits.length).slice(0, 80);
  const r = await o.run(extractPrompt(o.target, fresh, known));
  res.costUsd = r.costUsd;
  let items: any[] = [];
  try { const s = r.text.indexOf("{"), e = r.text.lastIndexOf("}"); items = JSON.parse(r.text.slice(s, e + 1)).items ?? []; } catch { throw new Error(`no JSON in the learner's reply: ${r.text.slice(0, 200)}`); }

  const now = new Date().toISOString();
  const lessons = readStore().lessons;
  for (const it of items) {
    if (typeof it?.rule !== "string" || !it.rule.trim()) continue;
    const quote = String(it.quote ?? fresh[(Number(it.note) || 1) - 1] ?? "").slice(0, 200);
    let obs = typeof it.same_as === "string" ? store.observations.find((x) => x.id === it.same_as && x.target === o.target) : undefined;
    const isNew = !obs;
    if (!obs) {
      obs = { id: `O${String(store.observations.reduce((m, x) => Math.max(m, parseInt(x.id.slice(1), 10) || 0), 0) + 1).padStart(3, "0")}`, target: o.target, rule: it.rule.trim(), hits: [] };
      store.observations.push(obs);
    }
    if (obs.hits.some((h) => h.video === o.video && h.act === o.act && h.quote === quote)) continue;
    obs.hits.push({ video: o.video, act: o.act, quote, at: now });
    const ev: Evidence = { video: o.video, metric: `note on ${o.act}:`, value: `"${quote}"` };
    const lesson = obs.lesson ? lessons.find((l) => l.id === obs!.lesson) : undefined;
    if (lesson) {
      if (lesson.status === "proposed" || lesson.status === "active") { addEvidence(lesson.id, [ev]); res.evidence.push(lesson.id); }
    } else if (new Set(obs.hits.map((h) => `${h.video}/${h.act}`)).size >= PROPOSE_AT) {
      const ids = propose([{
        target: o.target, rule: obs.rule,
        why: `Came up in review notes on ${obs.hits.length} acts (${[...new Set(obs.hits.map((h) => h.video))].join(", ")}).`,
        evidence: obs.hits.map((h) => ({ video: h.video, metric: `note on ${h.act}:`, value: `"${h.quote}"` })),
        confidence: obs.hits.length >= 4 ? "high" : obs.hits.length >= 3 ? "medium" : "low",
        basis: new Set(obs.hits.map((h) => h.video)).size,
        verify: "Check that the next videos' review notes stop raising it.",
      }], { review: `notes ${o.video}/${o.act}`, agent: "notes learner" });
      if (ids[0]) { obs.lesson = ids[0]; res.proposed.push(ids[0]); }
    }
    res.rules.push({ id: obs.id, rule: obs.rule, count: obs.hits.length, isNew });
  }
  for (const x of fresh) store.seen.push(hashOf(x));
  writeObs(store);
  return res;
}

// ───────────── CLI ─────────────
if (import.meta.main) {
  const { runAgentAsync } = await import("../05-video/src/lib/agent");
  const { roleModel } = await import("../lib/models");
  const { recordTiming } = await import("../05-video/src/lib/timings");
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const model = roleModel("notesLearner", flag("--model"));
  const shortWs = (ws: string) => { try { return JSON.parse(fs.readFileSync(path.join(ws, "config.json"), "utf-8")).format === "short"; } catch { return false; } };
  const one = async (video: string, act: string, file: string, wsDir: string) => {
    const logPath = path.join(wsDir, "05-video", "review", act, `learn_${Date.now()}.log`);
    const r = await learnFromNotes({
      video, act, notes: fs.readFileSync(file, "utf-8"), target: shortWs(wsDir) ? "SHORT_ACT" : "ACT",
      run: async (prompt) => {
        const a = await runAgentAsync({ prompt, model, tools: ["Read"], maxTurns: 2, logPath });
        if (!a.ok) throw new Error(`learner failed (${a.limit ?? "see " + logPath})`);
        recordTiming(wsDir, { step: `learn notes ${act}`, ms: a.durationMs, model, costUsd: a.costUsd, inputTokens: a.inputTokens, outputTokens: a.outputTokens, cacheReadTokens: a.cacheReadTokens });
        return a;
      },
    });
    if (!r.newItems) { console.log(`   🧠 ${video}/${act}: no new notes to learn from`); return; }
    console.log(`   🧠 ${video}/${act}: ${r.newItems} new note${r.newItems === 1 ? "" : "s"} → ${r.rules.length} general rule${r.rules.length === 1 ? "" : "s"}${r.costUsd ? ` ($${r.costUsd.toFixed(3)})` : ""}`);
    for (const x of r.rules) console.log(`      ${x.id} ×${x.count}${x.isNew ? " (new)" : ""}: ${x.rule}`);
    for (const id of r.proposed) console.log(`   💡 lesson ${id} proposed (it keeps coming up): approve it in Analytics → Lessons`);
    for (const id of new Set(r.evidence)) console.log(`   ↻ ${id} came up again (evidence added)`);
  };
  if (args.includes("--backfill")) {
    const root = path.join(REPO, "workspace");
    const files: [string, string, string, string][] = [];
    const scan = (wsDir: string, video: string) => {
      const rev = path.join(wsDir, "05-video", "review");
      if (!fs.existsSync(rev)) return;
      for (const act of fs.readdirSync(rev).sort()) { const f = path.join(rev, act, "director_notes.md"); if (fs.existsSync(f)) files.push([video, act, f, wsDir]); }
    };
    for (const v of fs.readdirSync(root).filter((d) => /^VID/.test(d)).sort()) {
      scan(path.join(root, v), v);
      const sh = path.join(root, v, "shorts");
      if (fs.existsSync(sh)) for (const s of fs.readdirSync(sh).sort()) scan(path.join(sh, s), `${v}/shorts/${s}`);
    }
    console.log(`🧠 learning from ${files.length} notes files with ${model}`);
    for (const [v, a, f, w] of files) { try { await one(v, a, f, w); } catch (e: any) { console.log(`   ⚠️  ${v}/${a}: ${e.message}`); } }
  } else {
    const video = flag("--video"), act = flag("--act")?.toUpperCase(), file = flag("--notes");
    if (!video || !act || !file) { console.error("Usage: bun run learn --video <ID> --act A03 --notes <file> | --backfill"); process.exit(1); }
    const wsDir = path.join(REPO, "workspace", video);
    await one(video, act, file, wsDir);
  }
}
