/**
 * Run a short through the pipeline: the same commands as the long video, on its nested workspace (<VID>/shorts/S1).
 *
 * Usage: bun run shorts --video <VID> --short S1|all [--step voice|align|plan|act|sound|draft|render] [--from voice] [--to draft]
 *                       [--model opus] [--director-model sonnet] [--act-model opus] [--tts "--pace 1.05 --exaggeration 0.7"] [--force]
 *                       [--no-music]   (leave the music bed out of the mix, e.g. to add a sound in the YouTube app instead)
 *
 * Stages (in order):
 *   voice   tts:format + tts (shorts voice settings: pace 1.0, short gaps, a bit more energy)          free, ~3–5 min
 *   align   transcribe + audio:master + captions + srt                                                 free, ~1 min
 *   plan    direct (one act, SHORT_DIRECTOR.md, Sonnet)                                         💲 ~$0.2–0.5
 *   act     act --act A01 (SHORT_ACT.md, Opus) + frames                                          💲 ~$2–4
 *   sound   cues + audio:music + audio:mix --with-music (voice + foley + spy-jazz bed, ducked)            free
 *           the bed is our own procedural music (no claims, no licence); to use a track instead, edit the short's
 *           06-audio/music.json source to {"type":"file","path":"assets/music/shorts/x.mp3","credit":"…"} and rerun --step sound
 *   draft   draft render (review it: dashboard Shorts → the short)                                    free
 *   render  final 1080x1920 render + qc (≤ 60 s, 9:16, loudness)                                     free
 * Default: --from voice --to draft, so a run stops at the draft for the creator's review (gate SG2); then --step render.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO, WS_ROOT, SHORT_TTS, shortVideoId, shortWs, listShorts, approvalState, exists } from "./lib";

// shorts carry the bed louder than long-form (phone speakers): ~14 LU under the voice instead of ~22
const SHORT_MUSIC = ["--music-db", "1", "--duck-db", "-9"];
const STAGES = ["voice", "align", "plan", "act", "sound", "draft", "render"] as const;
type Stage = (typeof STAGES)[number];

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const vid = flag("--video") ?? flag("-v");
const which = (flag("--short") ?? "").toUpperCase();
if (!vid || !which || !exists(path.join(WS_ROOT, vid))) {
  console.error("Usage: bun run shorts --video <VID> --short S1|all [--step <stage>] [--from <stage>] [--to <stage>]");
  console.error(`Stages: ${STAGES.join(" → ")}`);
  process.exit(1);
}
const stage = (n: string | undefined, def: Stage): Stage => {
  if (!n) return def;
  if (!(STAGES as readonly string[]).includes(n)) { console.error(`❌ unknown stage "${n}" (${STAGES.join(", ")})`); process.exit(1); }
  return n as Stage;
};
const step = flag("--step");
const from = stage(step ?? flag("--from"), "voice"), to = stage(step ?? flag("--to"), "draft");
const run = STAGES.slice(STAGES.indexOf(from), STAGES.indexOf(to) + 1);
const ttsExtra = (flag("--tts") ?? "").split(/\s+/).filter(Boolean);
const directorModel = flag("--director-model") ?? flag("--model");
const actModel = flag("--act-model") ?? flag("--model");
const force = args.includes("--force");
const noMusic = args.includes("--no-music");

const ids = which === "ALL" ? listShorts(vid) : which.split(",");
if (!ids.length) { console.error(`❌ ${vid} has no shorts (bun run shorts:write --video ${vid})`); process.exit(1); }

function sh(label: string, cmd: string[]): void {
  console.log(`\n▶ ${label}: bun run ${cmd.join(" ")}`);
  const r = spawnSync("bun", ["run", ...cmd], { cwd: REPO, stdio: "inherit", env: process.env });
  if (r.status !== 0) { console.error(`\n❌ ${label} failed (exit ${r.status})`); process.exit(r.status ?? 1); }
}

function commands(id: string, s: Stage): [string, string[]][] {
  const v = ["--video", id];
  switch (s) {
    case "voice": return [["format", ["tts:format", ...v]], ["voice", ["tts", ...v, "--force", "--combine", ...SHORT_TTS, ...ttsExtra]]];
    case "align": return [["transcribe", ["transcribe", ...v]], ["master", ["audio:master", ...v]], ["captions", ["captions", ...v]], ["srt", ["srt", ...v]]];
    case "plan": return [["direct", ["direct", ...v, ...(directorModel ? ["--model", directorModel] : [])]]];
    case "act": return [["act", ["act", ...v, "--act", "A01", ...(actModel ? ["--model", actModel] : []), ...(force ? ["--force"] : [])]]];
    case "sound": return noMusic ? [["cues", ["cues", ...v]], ["mix", ["audio:mix", ...v]]]
      : [["cues", ["cues", ...v]], ["music", ["audio:music", ...v]], ["mix", ["audio:mix", ...v, "--with-music", ...SHORT_MUSIC]]];
    case "draft": return [["draft", ["draft", ...v]]];
    case "render": return [["render", ["render", ...v]], ["qc", ["qc", ...v]]];
  }
}

for (const sid of ids) {
  const ws = shortWs(vid, sid), id = shortVideoId(vid, sid);
  if (!exists(ws)) { console.error(`❌ no short ${sid}`); process.exit(1); }
  if (run.includes("voice") && approvalState(ws) !== "approved") {
    console.error(`❌ ${sid}: script ${approvalState(ws)}. Review it, then: bun run shorts:write --video ${vid} --approve ${sid}`);
    process.exit(1);
  }
  console.log(`\n━━━ ${id}: ${run.join(" → ")} ━━━`);
  for (const s of run) for (const [label, cmd] of commands(id, s)) sh(`${sid} ${s}/${label}`, cmd);
}
const last = run[run.length - 1];
if (last === "draft") console.log(`\n🎬 Draft ready: workspace/${vid}/shorts/<S>/05-video/draft.mp4. Review it (dashboard → Shorts), fix, then: bun run shorts --video ${vid} --short ${which} --step render`);
if (last === "render") console.log(`\n✅ Final + QC done. Package for upload: bun run shorts:export --video ${vid}`);
