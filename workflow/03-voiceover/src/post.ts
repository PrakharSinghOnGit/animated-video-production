#!/usr/bin/env bun
/**
 * Voice post: speed and gaps for the whole voiceover, then the combined file. Runs after the voice step and before
 * Align (dashboard: Align → Speed & gaps; "Align all" runs it first with the last used settings).
 *
 *   bun run tts:post --video <ID> [--speed 1.08] [--gap 0.6] [--chapter-gap 2.5] [--max-pause 0.8]
 *
 * - The untouched TTS output is kept in 03-voiceover/audio/raw/part-N/ (copied the first time a file is seen, or when
 *   the voice step rewrote it), and every run starts from that copy: re-running with new settings never stacks.
 * - Per section: trailing silence trimmed to a natural 0.15 s tail, tempo changed with rubberband's fine (R3) engine
 *   (pitch and formants unchanged, float processing, written back at 24-bit), then the gap appended: `--gap` after a
 *   section, `--chapter-gap` before a chapter (the silent pause the chapter card plays in), nothing after the last.
 * - Writes the section files back in place (what Align reads), combined/part_N_combined.wav and
 *   combined/full_voiceover.wav (what mastering reads), and audio/post.json (settings + which files are ours).
 * - --max-pause: any silence inside a section longer than this is shortened to it (a TTS take that stalls mid-sentence);
 *   0 = off. Runs before transcription, so word timings follow the shortened audio.
 * Settings not given default to the last run's (post.json), else speed 1, gap 0.9 s, chapter gap 2.5 s, max pause off.
 * - Holds (03-voiceover/holds.json, "pauses for the picture"): extra silence after a word, cut only at a true pause point
 *   (holds.py checks the waveform), or added to the gap after a section. Positions come from the last transcript, so a
 *   hold inside a section needs the voice transcribed with the same speed/pause settings first. Writes audio/retime.json
 *   (old and new holds) for `voice:holds --shift-plan`, which moves the plan's times to match after captions are rebuilt.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveWorkspace, loadSections } from "./workspace";
import { readHolds, holdsPy, wordsPath, toBase, retimePath, type Applied } from "./holdlib";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const num = (n: string) => { const v = flag(n); if (v === undefined) return undefined; const x = parseFloat(v); if (!Number.isFinite(x)) { console.error(`❌ ${n} needs a number`); process.exit(1); } return x; };

const TAIL = 0.15;   // natural tail kept after the last word of a section (s)

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  if (r.status !== 0) { console.error(`❌ ${cmd} failed: ${(r.stderr || r.stdout || "").slice(-600)}`); process.exit(1); }
  return r.stdout;
}
const duration = (f: string) => parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])) || 0;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

async function main() {
  const video = flag("--video");
  if (!video) { console.error("Usage: bun run tts:post --video <ID> [--speed 1.08] [--gap 0.6] [--chapter-gap 2.5]"); process.exit(1); }
  const ws = resolveWorkspace(video);
  const audio = ws.audioDir, rawDir = path.join(audio, "raw"), stateFile = path.join(audio, "post.json");
  const prev = (() => { try { return JSON.parse(fs.readFileSync(stateFile, "utf-8")); } catch { return null; } })();
  const speed = num("--speed") ?? prev?.speed ?? 1;
  const gap = num("--gap") ?? prev?.gap ?? 0.9;
  const chapterGap = num("--chapter-gap") ?? prev?.chapterGap ?? 2.5;
  const maxPause = num("--max-pause") ?? prev?.maxPause ?? 0;
  if (maxPause && maxPause < 0.2) { console.error("❌ --max-pause must be 0 (off) or at least 0.2 s"); process.exit(1); }
  if (speed < 0.5 || speed > 2) { console.error("❌ --speed must be between 0.5 and 2"); process.exit(1); }
  if (gap < 0 || chapterGap < 0) { console.error("❌ gaps cannot be negative"); process.exit(1); }
  if (speed !== 1 && spawnSync("rubberband", ["--version"]).status !== 0) { console.error("❌ rubberband is not installed: brew install rubberband"); process.exit(1); }

  // section files in script order (same order Align and the combined file use)
  const parts = fs.existsSync(audio) ? fs.readdirSync(audio).filter((d) => /^part-\d+$/.test(d)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))) : [];
  const all = parts.flatMap((p) => fs.readdirSync(path.join(audio, p)).filter((f) => f.endsWith(".wav")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => `${p}/${f}`));
  const sections = await loadSections(ws);
  // only the current script's sections ("NN_<id>.wav"); files left over from an earlier script version are moved to
  // audio/stale/ (not deleted) so neither the combined file nor Align picks them up
  const want = new Set(sections.map((s, i) => `part-${s.part}/${String(i + 1).padStart(2, "0")}_${s.id}.wav`));
  const stale = all.filter((f) => !want.has(f));
  for (const f of stale) {
    const to = path.join(audio, "stale", f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(path.join(audio, f), to);
    const r = path.join(rawDir, f);
    if (fs.existsSync(r)) fs.rmSync(r);
  }
  if (stale.length) console.log(`  moved ${stale.length} file(s) from an older script version to audio/stale/`);
  const files = all.filter((f) => want.has(f));
  const missing = [...want].filter((f) => !all.includes(f));
  if (!files.length) { console.error(`❌ no voice sections in ${audio}: run the voice step first`); process.exit(1); }
  if (missing.length) { console.error(`❌ ${missing.length} section(s) have no voice yet (e.g. ${missing[0]}): run the voice step for them first`); process.exit(1); }
  const chapterEnd = (rel: string) => {
    const m = path.basename(rel).match(/^(\d+)_/);
    const i = m ? parseInt(m[1], 10) - 1 : -1, sec = sections[i], next = sections[i + 1];
    return !!(sec && next && next.part !== sec.part && next.chapterTitle !== undefined);
  };

  const ours: Record<string, number> = prev?.files ?? {};
  // holds: settings that move every position (then holds inside sections wait for a fresh transcript)
  const sameBase = !!prev && prev.speed === speed && (prev.maxPause ?? 0) === maxPause && prev.gap === gap && prev.chapterGap === chapterGap;
  const prevApplied: Applied[] = prev?.holds ?? [];
  const holds = readHolds(ws.rootDir).holds.filter((h) => h.on && h.ms > 0);
  const applied: Applied[] = [];
  let resourced = false, baseOff = 0, heldOff = 0;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wg_post_"));
  let before = 0, after = 0;
  console.log(`🎚  Voice post: speed ×${speed}, gap ${gap}s, chapter gap ${chapterGap}s${maxPause ? `, pauses inside capped at ${maxPause}s` : ""} (${files.length} sections${speed !== 1 ? ", rubberband fine engine" : ""})`);
  const outFiles: string[] = [];
  files.forEach((rel, idx) => {
    const cur = path.join(audio, rel), raw = path.join(rawDir, rel);
    // a file the voice step wrote (not our last output) becomes the new raw source
    const mt = fs.statSync(cur).mtimeMs;
    const fresh = !fs.existsSync(raw) || ours[rel] !== mt;
    if (fresh) { fs.mkdirSync(path.dirname(raw), { recursive: true }); fs.copyFileSync(cur, raw); if (prev) resourced = true; }
    before += duration(raw);
    const last = idx === files.length - 1;
    const pad = last ? 0 : Math.max(0, (chapterEnd(rel) ? chapterGap : gap) - TAIL);
    const t1 = path.join(tmp, `a${idx}.wav`), t2 = path.join(tmp, `b${idx}.wav`);
    // trim the trailing silence to a natural tail (float, no requantising)
    // silenceremove keeps about stop_duration + stop_silence of each long silence (peak detection, short window: measured
    // on Gemini takes, a 2.8 s stall at --max-pause 0.8 comes out at ~0.82 s)
    const cap = maxPause ? `silenceremove=stop_periods=-1:stop_duration=${maxPause / 2}:stop_silence=${maxPause / 2}:stop_threshold=-42dB:detection=peak:window=0.02,` : "";
    run("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", `${cap}areverse,silenceremove=start_periods=1:start_silence=${TAIL}:start_threshold=-45dB,areverse`, "-c:a", "pcm_f32le", t1]);
    let src = t1;
    if (Math.abs(speed - 1) > 1e-3) { run("rubberband", ["-q", "--fine", "--tempo", String(speed), t1, t2]); src = t2; }
    // holds for this section: inside it at a clean pause point, or after it (added to the gap)
    const id = path.basename(rel, ".wav"), mine = holds.filter((h) => h.section === id);
    const baseDur = duration(src);
    let inserted = 0, endMs = 0;
    const inner = mine.filter((h) => h.after !== "end"), endH = mine.filter((h) => h.after === "end");
    if (inner.length) {
      const wf = wordsPath(ws.rootDir, id);
      const words: { start: number; end: number }[] = (() => { try { return JSON.parse(fs.readFileSync(wf, "utf-8")).words; } catch { return []; } })();
      const transcribedAfterLastPost = prev && fs.existsSync(wf) && fs.statSync(wf).mtimeMs > Date.parse(prev.at);
      const reason = !sameBase ? "speed/gap/pause settings changed in this run: run Align once, then apply the pauses again"
        : fresh ? "this section's voice is new: run Align once (transcribe), then apply the pauses again"
        : !transcribedAfterLastPost ? "the transcript is older than the last merge: run Align (transcribe) first" : null;
      const mineOld = prevApplied.filter((a) => a.section === id && a.ok && a.local != null).map((a) => ({ baseAt: a.local, ms: a.ms }));
      const req: { id: string; lo: number; hi: number; ms: number }[] = [];
      for (const h of inner) {
        const w = words[h.after as number], n = words[(h.after as number) + 1];
        if (reason || !w || !n) { applied.push({ id: h.id, section: id, after: h.after, ms: h.ms, local: null, baseAt: null, mergedAt: null, ok: false, why: reason ?? "word not found in the transcript" }); continue; }
        req.push({ id: h.id, lo: toBase(w.end, mineOld) - 0.08, hi: toBase(n.start, mineOld) + 0.08, ms: h.ms });
      }
      if (req.length) {
        const t3 = path.join(tmp, `h${idx}.wav`);
        const res = holdsPy(["insert", "--wav", src, "--out", t3, "--holds", JSON.stringify(req)]).applied as any[];
        let before = 0;
        for (const r of res.sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9))) {
          if (r.ok) {
            applied.push({ id: r.id, section: id, after: inner.find((h) => h.id === r.id)!.after, ms: r.ms, local: r.at, baseAt: baseOff + r.at, mergedAt: heldOff + r.at + before / 1000, ok: true });
            before += r.ms; inserted += r.ms;
          } else applied.push({ id: r.id, section: id, after: inner.find((h) => h.id === r.id)!.after, ms: r.ms, local: null, baseAt: null, mergedAt: null, ok: false, why: r.why });
        }
        if (inserted) src = t3;
      }
    }
    for (const h of endH) {
      if (last) { applied.push({ id: h.id, section: id, after: "end", ms: h.ms, local: null, baseAt: null, mergedAt: null, ok: false, why: "after the last section: nothing follows" }); continue; }
      applied.push({ id: h.id, section: id, after: "end", ms: h.ms, local: baseDur, baseAt: baseOff + baseDur, mergedAt: heldOff + baseDur + inserted / 1000, ok: true });
      endMs += h.ms;
    }
    run("ffmpeg", ["-v", "error", "-y", "-i", src, "-af", `apad=pad_dur=${(pad + endMs / 1000).toFixed(3)}`, "-c:a", "pcm_s24le", cur]);
    baseOff += baseDur + pad; heldOff += baseDur + pad + (inserted + endMs) / 1000;
    ours[rel] = fs.statSync(cur).mtimeMs;
    after += duration(cur);
    outFiles.push(cur);
  });

  // combined files (what mastering reads)
  const combined = path.join(audio, "combined");
  fs.mkdirSync(combined, { recursive: true });
  const concat = (list: string[], out: string) => {
    const lst = path.join(tmp, `${path.basename(out)}.txt`);
    fs.writeFileSync(lst, list.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
    run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c:a", "pcm_s24le", out]);
  };
  for (const p of parts) concat(outFiles.filter((f) => f.includes(`${path.sep}${p}${path.sep}`)), path.join(combined, `part_${p.slice(5)}_combined.wav`));
  concat(outFiles, path.join(combined, "full_voiceover.wav"));
  fs.rmSync(tmp, { recursive: true, force: true });

  fs.writeFileSync(stateFile, JSON.stringify({ speed, gap, chapterGap, maxPause, at: new Date().toISOString(), files: ours, holds: applied }, null, 2));
  // what the plan's times need: the same voice without holds before and after (else the plan must be redone)
  // re-resolving a hold from a fresh transcript may move its cut a few ms inside the same silence: not a change
  const po = prevApplied.filter((a) => a.ok), pn = applied.filter((a) => a.ok);
  const changed = po.length !== pn.length || po.some((a, i) => a.ms !== pn[i].ms || Math.abs((a.baseAt ?? 0) - (pn[i].baseAt ?? 0)) > 0.05);
  fs.writeFileSync(retimePath(ws.rootDir), JSON.stringify({
    at: new Date().toISOString(), baseSame: sameBase && !resourced, changed,
    old: prevApplied.filter((a) => a.ok).map((a) => ({ baseAt: a.baseAt, ms: a.ms })), new: applied.filter((a) => a.ok).map((a) => ({ baseAt: a.baseAt, ms: a.ms })),
  }, null, 2));
  const ok = applied.filter((a) => a.ok), bad = applied.filter((a) => !a.ok);
  if (applied.length) console.log(`  pauses for the picture: ${ok.length} applied (+${(ok.reduce((s, a) => s + a.ms, 0) / 1000).toFixed(1)} s)${bad.length ? `, ${bad.length} not applied:` : ""}`);
  for (const b of bad) console.log(`    ✗ ${b.section} after ${b.after === "end" ? "the section" : `word ${b.after}`}: ${b.why}`);
  console.log(`  ✓ ${fmt(before)} → ${fmt(after)} (raw sections in audio/raw/, combined/full_voiceover.wav)`);
  console.log("  Next: Align (transcribe → master → captions → .srt) so word timings match the new audio.");
}

main();
