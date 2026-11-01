/**
 * The analytics reviewer: reads the cached snapshot + the deterministic flags + each linked video's script, plan and
 * publish package, and proposes lessons for the prompts. Proposals land in workflow/learning/lessons.json as
 * "proposed"; nothing reaches a prompt until it is approved in the dashboard (Analytics → Lessons).
 *
 * Usage: bun run yt:review [--video <VID or YouTube id>] [--agent sonnet|opus|haiku|agy] [--mock]
 * Output: workspace/_analytics/reviews/<time>_<agent>.json|md|log and reviews/latest.json
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { ACTIVE_CAP, TARGET_INFO, propose, readStore } from "../learning/lessons";
import { DIR, REPO, fmtTime, readJson, readSnapshot, wsDir, writeJson } from "./lib";
import { diagnose } from "./diagnose";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const agent = roleModel("analytics", flag("--agent"));
const agentSlug = specSlug(agent);
const only = flag("--video");
const mock = args.includes("--mock");


const snap = readSnapshot(mock);
if (!snap) { console.error(`❌ no ${mock ? "mock " : ""}snapshot: run bun run yt:fetch${mock ? " --mock (bun run yt:mock)" : ""} first`); process.exit(1); }
const dx = diagnose(snap);
const focus = only ? snap.videos.filter((v) => v.ws === only || v.ytId === only) : snap.videos.filter((v) => !v.short);
if (only && !focus.length) { console.error(`❌ ${only} is not in the snapshot (link it on the Analytics page, then refresh)`); process.exit(1); }
const store = readStore();
const pct = (x?: number, d = 1) => (x === undefined || !Number.isFinite(x) ? "n/a" : `${(x * 100).toFixed(d)}%`);
const b = dx.baseline;

const table = snap.videos.filter((v) => !v.short).map((v) => {
  const m = dx.videos[v.ytId].metrics;
  return `| ${v.ws ?? "-"} | ${v.ytId} | ${v.title.replace(/\|/g, "/")} | ${v.publishedAt.slice(0, 10)} | ${fmtTime(v.durationS)} | ${v.views} | ${m.impressions ?? "n/a"} | ${pct(m.ctr)} | ${pct(m.avgPct, 0)} | ${pct(m.ret30, 0)} | ${m.relEarly?.toFixed(2) ?? "n/a"} | ${m.subsPer1k?.toFixed(1) ?? "n/a"} |`;
}).join("\n");

const detail = focus.map((v) => {
  const d = dx.videos[v.ytId];
  const files = v.ws ? [
    ["script (what the narration says)", "02-scripting/script_raw.md"], ["plan (acts, timings, data)", "05-video/acts.json"],
    ["publish package (3 titles + thumbnail briefs)", "07-publish/metadata.json"], ["thumbnails declared", "07-publish/thumbnails.json"],
    ["lessons this video was made with", "lessons_used.json"],
  ].filter(([, f]) => fs.existsSync(path.join(wsDir(v.ws!), f))).map(([what, f]) => `  - ${what}: ${path.join(wsDir(v.ws!), f)}`) : [];
  const thumbs = v.ws ? (() => { try { return fs.readdirSync(path.join(wsDir(v.ws!), "07-publish/thumbnails")).filter((f) => /\.(png|jpe?g)$/.test(f)).map((f) => `  - thumbnail image: ${path.join(wsDir(v.ws!), "07-publish/thumbnails", f)}`); } catch { return []; } })() : [];
  return `### ${v.ws ?? v.ytId}: "${v.title}"
- YouTube ${v.ytId}, published ${v.publishedAt.slice(0, 10)}, ${fmtTime(v.durationS)}, ${v.views} views${v.impressions ? `, ${v.impressions} impressions, CTR ${pct(v.ctr)}` : ""}
- Flags:
${d.flags.map((f) => `  - [${f.kind}/${f.area}/sev ${f.severity}] ${f.text}${f.basis ? ` (basis: ${f.basis})` : ""} → ${f.targets.join(", ") || "-"}`).join("\n") || "  - none"}
${d.acts.length ? `- Acts (retention at start → end, loss per minute, relative retention):\n${d.acts.map((a) => `  - ${a.id} "${a.title}" ${fmtTime(a.startS)}-${fmtTime(a.endS)}: ${pct(a.startWatch, 0)} → ${pct(a.endWatch, 0)}, ${pct(a.lossPerMin)}/min${a.rel !== undefined ? `, rel ${a.rel.toFixed(2)}` : ""}`).join("\n")}` : "- No act timeline (not linked to a workspace, or no retention data)."}
${v.traffic?.length ? `- Traffic sources: ${v.traffic.slice(0, 6).map((t) => `${t.source} ${t.views}`).join(", ")}` : ""}
${files.length || thumbs.length ? `- Evidence to open with Read:\n${[...files, ...thumbs].join("\n")}` : ""}`;
}).join("\n\n");

const lessonLine = (l: (typeof store.lessons)[number]) => `- ${l.id} [${l.status}] ${l.target}: ${l.rule}${l.reason ? ` (creator: ${l.reason})` : ""}`;
const prompt = `${fs.readFileSync(path.join(REPO, "workflow/prompts/ANALYTICS_REVIEW.md"), "utf-8").replace(/{{CAP}}/g, String(ACTIVE_CAP))}

# The data${snap.mock ? "\n**MOCK DATA** (for testing the pipeline: say so in the summary)." : ""}
Channel: ${snap.channel.title} (${snap.channel.subs} subscribers, ${snap.channel.videos} videos). Snapshot ${snap.fetchedAt.slice(0, 16)}; range ${snap.range.start} → ${snap.range.end}.
Impressions/CTR: ${snap.reach.status} (${snap.reach.note}).
Channel medians over ${b.n} long-form videos with ≥100 views${b.n < 3 ? " (fewer than 3: medians are not used for flags yet)" : ""}: CTR ${pct(b.ctr)}, avg viewed ${pct(b.avgPct, 0)}, at 0:30 ${pct(b.ret30, 0)}, early relative retention ${Number.isFinite(b.relEarly) ? b.relEarly!.toFixed(2) : "n/a"}, subs/1k views ${Number.isFinite(b.subsPer1k) ? b.subsPer1k!.toFixed(1) : "n/a"}.

| workspace | YouTube id | title | published | length | views | impressions | CTR | avg viewed | at 0:30 | early rel. ret. | subs/1k |
|---|---|---|---|---|---|---|---|---|---|---|---|
${table}

## ${only ? "The video to review" : "Videos to review"}
${detail}

## Prompts a lesson can target
${Object.entries(TARGET_INFO).map(([k, v]) => `- ${k}: ${v} (workflow/prompts/${k}.md)`).join("\n")}

## Existing lessons (do not re-propose; consider replacing or retiring)
${store.lessons.length ? store.lessons.map(lessonLine).join("\n") : "(none yet)"}
`;

const out = path.join(DIR, "reviews");
fs.mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logPath = path.join(out, `${stamp}_${agentSlug}.log`);
fs.writeFileSync(path.join(out, `${stamp}_${agentSlug}.prompt.md`), prompt, "utf-8");
console.log(`🧠 Reviewing ${only ?? `${focus.length} videos`} with ${agent}…`);
const t0 = Date.now();
let result: any = null, costUsd = 0;
if (isAgy(agent)) {
  const r = await runAgyJson({ prompt, model: agyModel(agent), logPath }).catch(() => ({ r: null as any, json: null }));
  result = r.json;
} else {
  const r = await runAgentAsync({ prompt, model: agent, tools: ["Read"], maxTurns: 40, logPath, cwd: REPO });
  try { result = extractJson(r.text); } catch {}
  costUsd = r.costUsd;
  recordTiming(DIR, { step: `analytics review (${agent})`, ms: r.durationMs, model: agent, costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
}
if (!result || typeof result.summary !== "string") { console.error(`❌ the reviewer returned no usable JSON (log: ${path.relative(REPO, logPath)})`); process.exit(1); }

const src = { review: stamp, agent };
const ids = propose(Array.isArray(result.lessons) ? result.lessons : [], src);
const full = { at: new Date().toISOString(), agent, costUsd, ms: Date.now() - t0, video: only ?? null, mock: !!snap.mock, proposed: ids, ...result };
writeJson(path.join(out, `${stamp}_${agentSlug}.json`), full);
writeJson(path.join(out, "latest.json"), full);
const md = [`## Analytics review by ${agent}, ${new Date().toLocaleString()}${only ? ` (${only})` : ""}`, result.summary, "",
  "### Findings", ...(result.findings ?? []).map((f: any) => `- [${f.kind}/${f.area}] ${f.video}: ${f.finding}`), "",
  "### Proposed lessons", ...(ids.length ? ids.map((id) => { const l = readStore().lessons.find((x) => x.id === id)!; return `- ${id} → ${l.target} (${l.confidence}, n=${l.basis}): ${l.rule}`; }) : ["- none"]),
  ...((result.retire ?? []).length ? ["", "### Suggested retirements", ...result.retire.map((r: any) => `- ${r.id}: ${r.why}`)] : []),
  ...((result.watch ?? []).length ? ["", "### Watch next upload", ...result.watch.map((w: string) => `- ${w}`)] : [])].join("\n");
fs.writeFileSync(path.join(out, `${stamp}_${agent}.md`), md + "\n", "utf-8");
console.log(`✅ ${ids.length} lesson(s) proposed in ${formatDuration(Date.now() - t0)}${costUsd ? `, $${costUsd.toFixed(2)}` : ""}: approve or reject them on the dashboard's Analytics page`);
console.log(result.summary);
for (const id of ids) { const l = readStore().lessons.find((x) => x.id === id)!; console.log(`   ${id} → ${l.target}: ${l.rule}`); }
