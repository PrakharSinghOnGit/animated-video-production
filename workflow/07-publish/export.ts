/**
 * Publish: collect what you upload into 07-publish/export/ (free).
 *   thumb_A.png (or .jpg) .. thumb_C, titles.txt ("A: ..."), description.txt, tags.txt, and the .srt when it exists.
 *
 * Usage: bun run publish:export --video <ID>
 */
import fs from "node:fs";
import path from "node:path";
import { VARIANTS, freshSrt, wsDir, pubFile, readJson, thumbPath, recheck, type Metadata } from "./lib";

const args = process.argv.slice(2);
const i = args.indexOf("--video");
const videoId = (i >= 0 ? args[i + 1] : undefined) ?? args.find((a) => !a.startsWith("-"));
if (!videoId) { console.error("Usage: bun run publish:export --video <ID>"); process.exit(1); }

const meta = readJson<Metadata>(pubFile(videoId, "metadata.json"));
if (!meta) { console.error(`❌ no metadata.json (bun run meta --video ${videoId})`); process.exit(1); }
const out = pubFile(videoId, "export");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const made: string[] = [];
for (const v of VARIANTS) {
  const p = thumbPath(videoId, v);
  if (!p) { console.error(`⚠ no thumbnail ${v}`); continue; }
  const name = `thumb_${v}${path.extname(p)}`;
  fs.copyFileSync(p, path.join(out, name));
  made.push(name);
}
const put = (name: string, text: string) => { fs.writeFileSync(path.join(out, name), text, "utf-8"); made.push(name); };
put("titles.txt", VARIANTS.map((v) => `${v}: ${meta.titles[v].title}`).join("\n") + "\n" + (meta.order ? `\nUpload order (strongest first; an inconclusive test keeps the first one): ${meta.order.join(", ")}\n` : ""));
put("description.txt", meta.description);
put("tags.txt", meta.tags.join(", ") + "\n");
const srt = path.join(wsDir(videoId), "07-assembly/export", `${videoId}.srt`);
freshSrt(videoId, srt, path.join(wsDir(videoId), "05-video", "captions.json"));
if (fs.existsSync(srt)) { fs.copyFileSync(srt, path.join(out, path.basename(srt))); made.push(path.basename(srt)); }
else console.error("⚠ no .srt yet (bun run srt)");

const approval = readJson<any>(pubFile(videoId, "approval.json"));
const c = recheck(videoId, meta);
console.log(`✅ ${made.join(", ")}\n   in ${path.relative(process.cwd(), out)}`);
console.log(approval ? `   approved ${approval.at}` : "   ⚠ not approved yet (dashboard: Publish > Approve)");
for (const e of c.errors) console.log(`   ✗ ${e}`);
const tc = readJson<Record<string, { errors: string[] }>>(pubFile(videoId, "thumbnails.checks.json")) ?? {};
for (const v of VARIANTS) for (const e of tc[v]?.errors ?? []) console.log(`   ✗ thumbnail ${v} is rejected: ${e}`);
for (const w of c.warnings) console.log(`   ⚠ ${w}`);
console.log("   Test & Compare: upload the 3 thumbnails (A, B, C) and give each package its own title; do not edit them while it runs.");
