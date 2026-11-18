/**
 * Shorts export (free): collect what you upload into workspace/<VID>/shorts/export/:
 *   S1.mp4 (the QC'd final), S1.txt (title, description with sources and credits, hashtags), S1.srt, and upload.md for all.
 *
 * Usage: bun run shorts:export --video <VID> [--short S1,S2] [--force]   (--force exports shorts whose QC has not passed)
 */
import fs from "node:fs";
import path from "node:path";
import { readText, freshSrt } from "../07-publish/lib";
import { WS_ROOT, shortsDir, shortWs, listShorts, readJson, exists, shortProgress, type ShortEntry } from "./lib";
import { tryRefreshLibrary } from "../../scripts/library";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const vid = flag("--video") ?? flag("-v");
if (!vid || !exists(path.join(WS_ROOT, vid))) { console.error("Usage: bun run shorts:export --video <VID> [--short S1,S2] [--force]"); process.exit(1); }
const ids = flag("--short") ? flag("--short")!.toUpperCase().split(",") : listShorts(vid);
const force = args.includes("--force");
const out = path.join(shortsDir(vid), "export");
fs.mkdirSync(out, { recursive: true });

// The long video's first title, for the "full video" line (link it as the short's Related video in YouTube Studio)
const longTitle: string | undefined = readJson(path.join(WS_ROOT, vid, "07-publish", "metadata.json"))?.titles?.A?.title;
const DISCLAIMER = "General education, not financial advice.";

const done: string[] = [], skipped: string[] = [];
const upload: string[] = [`# Shorts for ${vid}`, "", longTitle ? `In Studio set each short's **Related video** to the long video ("${longTitle}").` : "In Studio set each short's **Related video** to the long video.", ""];
for (const sid of ids) {
  const ws = shortWs(vid, sid), p = shortProgress(vid, sid);
  const sj = readJson<ShortEntry>(path.join(ws, "02-scripting", "short.json"));
  if (!p.render || !sj) { skipped.push(`${sid} (${!sj ? "no short.json" : "no final.mp4"})`); continue; }
  if (!p.qc && !force) { skipped.push(`${sid} (QC has not passed on the current final: bun run qc --video ${vid}/shorts/${sid}; --force to export anyway)`); continue; }
  fs.copyFileSync(path.join(ws, "05-video", "final.mp4"), path.join(out, `${sid}.mp4`));
  const srt = path.join(ws, "07-assembly", "export", `${vid}_shorts_${sid}.srt`);
  freshSrt(`${vid}/shorts/${sid}`, srt, path.join(ws, "05-video", "captions.json"));
  if (exists(srt)) fs.copyFileSync(srt, path.join(out, `${sid}.srt`));
  const sources = [...new Set((sj.data ?? []).map((d) => d.source).filter((s) => s && !/unverified/i.test(s)))];
  // only what needs attribution (CC BY / licensed): credits.txt's first block, minus its "(none)"
  const block = readText(path.join(ws, "06-audio", "credits.txt")).split(/ATTRIBUTION REQUIRED[^\n]*\n/)[1]?.split(/\n\s*\n/)[0] ?? "";
  const credits = block.split("\n").map((l) => l.trim()).filter((l) => l && l !== "(none)").join("\n");
  const desc = [
    sj.description?.trim(),
    longTitle ? `Full video: ${longTitle}` : "",
    sources.length ? `Sources:\n${sources.map((s) => `- ${s}`).join("\n")}` : "",
    credits ? `Sound credits:\n${credits}` : "",
    DISCLAIMER,
    (sj.hashtags ?? []).join(" "),
  ].filter(Boolean).join("\n\n");
  fs.writeFileSync(path.join(out, `${sid}.txt`), `TITLE\n${sj.title}\n\nDESCRIPTION\n${desc}\n`, "utf-8");
  upload.push(`## ${sid}: ${sj.title}`, `- file: ${sid}.mp4${exists(srt) ? `, captions: ${sid}.srt` : ""}`, `- kind: ${sj.kind}; ${sj.words} words`,
    ...(sj.checks?.warnings ?? []).map((w) => `- ⚠ ${w}`), "");
  done.push(sid);
}
fs.writeFileSync(path.join(out, "upload.md"), upload.join("\n"), "utf-8");
console.log(done.length ? `✅ exported ${done.join(", ")} → ${path.relative(process.cwd(), out)}` : "⚠️  nothing exported");
for (const s of skipped) console.log(`   ⏩ ${s}`);
if (done.length) tryRefreshLibrary();
if (skipped.length && !done.length) process.exit(1);
