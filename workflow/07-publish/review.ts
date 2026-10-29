/**
 * Publish: the thumbnail critic. A vision model (cheap by default) looks at each thumbnail and the preview sheets and checks
 * them against the guide's checklist: legibility at 168 px, word count, one focal point, contrast, the safe zone under the
 * duration badge, truthfulness against the video, distinctness of the three concepts.
 *
 * Usage: bun run thumbs:review --video <ID> [--agent haiku|sonnet|opus|agy] [--to-notes]
 *   --to-notes  append each variant's findings to 07-publish/notes/<V>.md (what "Fix with notes" sends to the author)
 * Output: 07-publish/review.md (latest, same shape as an act review) and reviews/<time>_<agent>.json|md
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { REPO, VARIANTS, GUIDE, wsDir, pubFile, readJson, readText, planNumbers, thumbPath, type Metadata } from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
const agent = (flag("--agent") ?? "haiku").toLowerCase();
if (!videoId || !["agy", "haiku", "sonnet", "opus"].includes(agent)) {
  console.error("Usage: bun run thumbs:review --video <ID> [--agent haiku|sonnet|opus|agy] [--to-notes]");
  process.exit(1);
}
const ws = wsDir(videoId);
const files = VARIANTS.map((v) => [v, thumbPath(videoId, v)] as const);
if (files.some(([, p]) => !p)) {
  console.error(`❌ missing thumbnails: ${files.filter(([, p]) => !p).map(([v]) => v).join(", ")} (bun run thumbs --video ${videoId})`);
  process.exit(1);
}
const sheets = ["preview_small.png", "preview.png"].map((f) => pubFile(videoId, f)).filter((p) => fs.existsSync(p));
const meta = readJson<Metadata>(pubFile(videoId, "metadata.json"));
const declared = readJson<Record<string, any>>(pubFile(videoId, "thumbnails.json")) ?? {};
const checks = readJson<Record<string, any>>(pubFile(videoId, "thumbnails.checks.json")) ?? {};
const plan = readJson<any>(path.join(ws, "05-video/acts.json"));
const pn = planNumbers(plan);

const brief = fs.readFileSync(path.join(REPO, "workflow/prompts/THUMBS_REVIEW.md"), "utf-8");
const prompt = `${brief}

# This video
Video: ${videoId}. Working title: ${plan?.video?.title ?? "(none)"}. Read first: ${GUIDE}
Images (open each with Read):
${files.map(([v, p]) => `- ${v}: ${p}`).join("\n")}
${sheets.map((p) => `- ${path.basename(p)}: ${p}`).join("\n")}

## Titles each thumbnail is paired with
${VARIANTS.map((v) => `- ${v}: "${meta?.titles?.[v]?.title ?? "(none)"}" [${meta?.titles?.[v]?.type ?? ""}]`).join("\n")}

## What the author says each thumbnail is (declared; verify against the image)
${JSON.stringify(declared, null, 1)}

## Measured checks (free pixel/file checks, treat as facts)
${JSON.stringify(checks, null, 1)}

## What the video shows and states (the plan; the acts are described in ${path.join(ws, "05-video/acts.json")})
Acts: ${(plan?.acts ?? []).map((a: any) => `${a.id} ${a.title}: ${a.idea}`).join(" | ")}
Sourced figures:
${pn.lines.join("\n")}
${agent === "agy" ? "\nDo not create or edit any file." : ""}`;

console.log(`🔎 Reviewing the thumbnails with ${agent}...`);
const t0 = Date.now();
const out = pubFile(videoId, "reviews");
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logPath = path.join(out, `${stamp}_${agent}.log`);
let result: any = null, costUsd = 0, ms = 0;
if (agent === "agy") {
  const r = await runAgyJson({ prompt, logPath }).catch(() => ({ r: null as any, json: null }));
  result = r.json; ms = r.r?.durationMs ?? Date.now() - t0;
  recordTiming(ws, { step: "thumbs review (agy)", ms, model: "agy", costUsd: 0 });
} else {
  const r = await runAgentAsync({ prompt, model: agent, tools: ["Read"], maxTurns: 30, logPath, cwd: REPO });
  try { result = extractJson(r.text); } catch {}
  costUsd = r.costUsd; ms = r.durationMs;
  recordTiming(ws, { step: `thumbs review (${agent})`, ms, model: agent, costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
}
if (!result?.variants) {
  console.error(`❌ the reviewer returned no usable JSON (log: ${path.relative(process.cwd(), logPath)})`);
  process.exit(1);
}
result = { agent, at: new Date().toISOString(), costUsd, ms, ...result };
fs.writeFileSync(path.join(out, `${stamp}_${agent}.json`), JSON.stringify(result, null, 2), "utf-8");

const line = (i: any) => `- [${i.kind}, ${i.severity}]: seen: ${i.seen}. Fix: ${i.fix}`;
const sections: Record<string, string[]> = Object.fromEntries(VARIANTS.map((v) => [v, (result.variants[v]?.issues ?? []).map(line)]));
const md = [`## Review: thumbnails by ${agent}, ${new Date().toLocaleString()} (overall ${result.overall}/10; ${VARIANTS.map((v) => `${v} ${result.variants[v]?.score ?? "?"}`).join(", ")})`, result.summary ?? "",
  ...((result.all ?? []).length ? ["### All variants", ...result.all.map(line)] : []),
  ...VARIANTS.flatMap((v) => [`### ${v}`, ...(sections[v].length ? sections[v] : ["- no issues"])])].join("\n");
fs.writeFileSync(path.join(out, `${stamp}_${agent}.md`), md + "\n", "utf-8");
fs.writeFileSync(pubFile(videoId, "review.md"), md + "\n", "utf-8");
if (args.includes("--to-notes")) {
  fs.mkdirSync(pubFile(videoId, "notes"), { recursive: true });
  for (const v of VARIANTS) {
    const lines = [...sections[v], ...(result.all ?? []).map(line)];
    if (!lines.length) continue;
    const f = pubFile(videoId, `notes/${v}.md`);
    fs.appendFileSync(f, `${readText(f).trim() ? "\n\n" : ""}Review (${agent}):\n${lines.join("\n")}\n`, "utf-8");
  }
  console.log("   appended to notes/<V>.md");
}
console.log(`✅ overall ${result.overall}/10 in ${formatDuration(Date.now() - t0)}${costUsd ? `, $${costUsd.toFixed(2)}` : ", free"}`);
for (const v of VARIANTS) for (const i of (result.variants[v]?.issues ?? []).slice(0, 4)) console.log(`   ${v} [${i.kind}/${i.severity}] ${i.seen} → ${i.fix}`);
console.log(`   ${path.relative(process.cwd(), pubFile(videoId, "review.md"))}`);
