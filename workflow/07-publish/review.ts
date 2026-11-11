/**
 * Publish: the thumbnail critic, in two passes.
 *   1. Blind read (role `stranger`, cheap): a viewer who sees ONLY each thumbnail at 168 x 94 px (thumbnails/phone/), with
 *      no title and no context, says what words it reads and what the picture shows. Declared words it cannot read, or
 *      a picture it cannot name, reject the variant (07-publish/phone.blind.json; merged into thumbnails.checks.json).
 *   2. The critic (role `thumbsReview`): would a stranger click, and are the three packages three different bets? It
 *      gets the measured phone checks and the blind read as facts, and returns the upload order.
 *
 * Usage: bun run thumbs:review --video <ID> [--agent haiku|sonnet|opus|agy] [--to-notes] [--no-blind]
 *   --to-notes  append each variant's findings to 07-publish/notes/<V>.md (what "Fix with notes" sends to the author)
 *   --no-blind  skip pass 1
 * Output: 07-publish/review.md (latest, same shape as an act review) and reviews/<time>_<agent>.json|md
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { REPO, VARIANTS, GUIDE, AXIS_KEYS, wsDir, pubFile, readJson, readText, mtime, planNumbers, thumbPath, channelPackages, usedThumbWords, type Metadata } from "./lib";
import { PHONE_SIZES, shrink, unreadWords, blindProblems, BLIND_MARK, type BlindFile, type BlindRead } from "./phone";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const videoId = flag("--video") ?? flag("-v");
const agent = roleModel("thumbsReview", flag("--agent"));
const agentSlug = specSlug(agent);
if (!videoId) {
  console.error("Usage: bun run thumbs:review --video <ID> [--agent <provider:model>] [--to-notes]");
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

const out = pubFile(videoId, "reviews");
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// the thumbnails at phone size (the render makes them; made here when a thumbnail is newer or they are missing)
const phone = Object.fromEntries(files.map(([v, p]) => {
  const f = pubFile(videoId, `thumbnails/phone/${v}_${PHONE_SIZES[0]}.png`);
  if (mtime(f) < mtime(p!)) shrink(p!, PHONE_SIZES[0], f);
  return [v, f];
}));

/** One agent call that must reply with JSON (Claude with Read only, or agy). */
async function ask(spec: string, prompt: string, logPath: string, step: string): Promise<{ json: any; costUsd: number; ms: number }> {
  const t = Date.now();
  if (isAgy(spec)) {
    const r = await runAgyJson({ prompt: `${prompt}\nDo not create or edit any file.`, model: agyModel(spec), logPath }).catch(() => ({ r: null as any, json: null }));
    recordTiming(ws, { step, ms: r.r?.durationMs ?? Date.now() - t, model: spec, costUsd: 0 });
    return { json: r.json, costUsd: 0, ms: r.r?.durationMs ?? Date.now() - t };
  }
  const r = await runAgentAsync({ prompt, model: spec, tools: ["Read"], maxTurns: 30, logPath, cwd: REPO });
  let json: any = null;
  try { json = extractJson(r.text); } catch {}
  recordTiming(ws, { step, ms: r.durationMs, model: spec, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
  return { json, costUsd: r.costUsd, ms: r.durationMs };
}

// ───────────── pass 1: the blind read ─────────────
let blind: BlindFile | null = null, blindCost = 0;
if (!args.includes("--no-blind")) {
  const viewer = roleModel("stranger");
  console.log(`👀 Blind read at ${PHONE_SIZES[0]} px with ${viewer}...`);
  const r = await ask(viewer, `${fs.readFileSync(path.join(REPO, "workflow/prompts/THUMBS_BLIND.md"), "utf-8")}\n\n# The images\n${VARIANTS.map((v) => `- ${v}: ${phone[v]}`).join("\n")}\n`, path.join(out, `${stamp}_blind_${specSlug(viewer)}.log`), `thumbs blind read (${viewer})`);
  blindCost = r.costUsd;
  if (r.json && VARIANTS.every((v) => r.json[v])) {
    const variants = Object.fromEntries(VARIANTS.map((v) => {
      const b = r.json[v], words: string[] = (Array.isArray(b.words) ? b.words : [String(b.words ?? "")]).map(String).filter(Boolean);
      return [v, { words, object: String(b.object ?? ""), about: String(b.about ?? ""), feeling: String(b.feeling ?? ""), unsure: String(b.unsure ?? ""), unread: unreadWords(String(declared[v]?.text ?? ""), words) } satisfies BlindRead];
    }));
    blind = { at: new Date().toISOString(), agent: viewer, mtimes: Object.fromEntries(files.map(([v, p]) => [v, mtime(p!)])), variants };
    fs.writeFileSync(pubFile(videoId, "phone.blind.json"), JSON.stringify(blind, null, 2), "utf-8");
    // into the checks the dashboard gates on (the next render keeps them while the image is unchanged)
    for (const v of VARIANTS) {
      const c = (checks[v] ??= { errors: [], warnings: [] });
      c.errors = [...(c.errors ?? []).filter((e: string) => !e.startsWith(BLIND_MARK)), ...blindProblems(variants[v])];
      console.log(`   ${v}: reads ${variants[v].words.length ? `"${variants[v].words.join(" ")}"` : "no words"}; sees: ${variants[v].object}; thinks it is about: ${variants[v].about}`);
      for (const e of blindProblems(variants[v])) console.log(`   ✗ ${v}: ${e}`);
    }
    fs.writeFileSync(pubFile(videoId, "thumbnails.checks.json"), JSON.stringify(checks, null, 2), "utf-8");
  } else console.log("   ⚠ the blind viewer returned no usable JSON: skipped");
}

// ───────────── pass 2: the critic ─────────────
const brief = fs.readFileSync(path.join(REPO, "workflow/prompts/THUMBS_REVIEW.md"), "utf-8");
const axes = (a?: Record<string, string>) => (a ? AXIS_KEYS.map((k) => `${k}: ${a[k]}`).join(", ") : "not declared");
const prompt = `${brief}

# This video
Video: ${videoId}. Working title: ${plan?.video?.title ?? "(none)"}. Read first: ${GUIDE}
Who the stranger is: workflow/01-ideation/AUDIENCE.md ("The viewer in one sentence").
Images (open each with Read, in this order):
${VARIANTS.map((v) => `- ${v} at phone size: ${phone[v]}`).join("\n")}
${files.map(([v, p]) => `- ${v} full size: ${p}`).join("\n")}
${sheets.map((p) => `- ${path.basename(p)}: ${p}`).join("\n")}

## The packages (title, lever, the axes the package asked for)
${VARIANTS.map((v) => `- ${v}: "${meta?.titles?.[v]?.title ?? "(none)"}" [${meta?.titles?.[v]?.lever ?? meta?.titles?.[v]?.type ?? ""}] asked for ${axes(meta?.titles?.[v]?.axes)}. The bet: ${meta?.titles?.[v]?.hypothesis ?? ""}`).join("\n")}

## What the author says each thumbnail is (declared; verify against the image)
${JSON.stringify(declared, null, 1)}

## Measured phone checks (free pixel measures and a text recogniser's read at 168 px; treat as facts)
${JSON.stringify(checks, null, 1)}

## Blind read (a viewer who saw only the 168 px image, no title, no context; treat as facts)
${blind ? JSON.stringify(blind.variants, null, 1) : "(not run)"}

## The channel's earlier packages and their click rates
${channelPackages(videoId).join("\n") || "(none)"}
Words already on earlier thumbnails: ${[...usedThumbWords(videoId).keys()].map((w) => w.toUpperCase()).join(", ") || "(none)"}

## What the video shows and states (the plan; the acts are described in ${path.join(ws, "05-video/acts.json")})
Acts: ${(plan?.acts ?? []).map((a: any) => `${a.id} ${a.title}: ${a.idea}`).join(" | ")}
Sourced figures:
${pn.lines.join("\n")}
`;

console.log(`🔎 Reviewing the thumbnails with ${agent}...`);
const t0 = Date.now();
const logPath = path.join(out, `${stamp}_${agentSlug}.log`);
const rr = await ask(agent, prompt, logPath, `thumbs review (${agent})`);
let result: any = rr.json;
const costUsd = rr.costUsd + blindCost, ms = rr.ms;
if (!result?.variants) {
  console.error(`❌ the reviewer returned no usable JSON (log: ${path.relative(process.cwd(), logPath)})`);
  process.exit(1);
}
result = { agent, at: new Date().toISOString(), costUsd, ms, ...result, blind: blind?.variants ?? null };
fs.writeFileSync(path.join(out, `${stamp}_${agentSlug}.json`), JSON.stringify(result, null, 2), "utf-8");

const line = (i: any) => `- [${i.kind}, ${i.severity}]: seen: ${i.seen}. Fix: ${i.fix}`;
const sections: Record<string, string[]> = Object.fromEntries(VARIANTS.map((v) => [v, (result.variants[v]?.issues ?? []).map(line)]));
const md = [`## Review: thumbnails by ${agent}, ${new Date().toLocaleString()} (overall ${result.overall}/10; ${VARIANTS.map((v) => `${v} ${result.variants[v]?.score ?? "?"}`).join(", ")})`, result.summary ?? "",
  ...((result.all ?? []).length ? ["### All variants", ...result.all.map(line)] : []),
  ...(Array.isArray(result.order) ? [`Upload order (strongest first; an inconclusive test keeps the first): ${result.order.join(", ")}`] : []),
  ...VARIANTS.flatMap((v) => [`### ${v}`, ...(result.variants[v]?.stranger ? [`Stranger: ${result.variants[v].stranger}`] : []), ...(blind ? [`Blind read at 168 px: words ${blind.variants[v].words.length ? `"${blind.variants[v].words.join(" ")}"` : "none"}; sees: ${blind.variants[v].object}; about: ${blind.variants[v].about}`] : []), ...(sections[v].length ? sections[v] : ["- no issues"])])].join("\n");
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
