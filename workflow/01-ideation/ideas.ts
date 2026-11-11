/**
 * Idea check: is an idea worth a video? Searches YouTube for the topic (who already covered it, which videos beat
 * their channel's usual reach), then a model judges the idea against workflow/01-ideation/AUDIENCE.md, the channel's
 * own uploads and numbers, and drafts three packages (title + thumbnail). Result: workspace/_ideas/ideas.json.
 *
 * Usage:
 *   bun run ideas --add "Title" [--note "..."] [--keywords "search words"]   add an idea (no research)
 *   bun run ideas --id I03 [--agent sonnet]                                    research one idea
 *   bun run ideas --all                                                        research every idea not researched yet
 *   bun run ideas --to-workspace I03 VID07_Name                                write the idea into the project's idea.md
 *
 * Cost per idea: 2 YouTube searches (100 quota units each, of 10,000 a day) + ~2 units for video/channel stats;
 * a cheap model picks the search words (role ideaQueries, Haiku), the check runs on role ideas (Sonnet by default).
 * Needs YOUTUBE_API_KEY in .env.
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming } from "../05-video/src/lib/timings";
import { readSnapshot, workspaces, wsDir, readText } from "../09-analytics/lib";
import { AUDIENCE_FILE, IDEAS_DIR, REPO, ideaMarkdown, nextIdeaId, readIdeas, writeIdeas, type Competitor, type Idea, type Research } from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DATA = "https://www.googleapis.com/youtube/v3";
const KEY = process.env.YOUTUBE_API_KEY;
let units = 0;

// ───────────── add / to-workspace ─────────────

if (flag("--add")) {
  const s = readIdeas();
  const idea: Idea = { id: nextIdeaId(s), title: flag("--add")!.trim(), note: flag("--note") ?? "", keywords: flag("--keywords") ?? "", status: "new", createdAt: new Date().toISOString() };
  s.ideas.push(idea);
  writeIdeas(s);
  console.log(`💡 ${idea.id}: ${idea.title}`);
  process.exit(0);
}
if (args.includes("--to-workspace")) {
  const i = args.indexOf("--to-workspace"), id = args[i + 1], ws = args[i + 2];
  const s = readIdeas(), idea = s.ideas.find((x) => x.id === id);
  if (!idea || !ws || !fs.existsSync(wsDir(ws))) { console.error(`❌ usage: --to-workspace <idea id> <existing workspace>`); process.exit(1); }
  const f = path.join(wsDir(ws), "02-scripting/idea.md");
  const cur = readText(f);
  // new_video writes a placeholder; never overwrite an idea the creator already wrote
  if (cur.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#")).length > 3) console.log(`   ${ws} already has an idea.md: left as it is`);
  else { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ideaMarkdown(idea), "utf-8"); console.log(`📝 ${path.relative(REPO, f)}`); }
  idea.status = "started"; idea.ws = ws;
  writeIdeas(s);
  process.exit(0);
}

// ───────────── research ─────────────

if (!KEY) { console.error("❌ YOUTUBE_API_KEY is missing in .env (Google Cloud → Credentials → API key, restricted to YouTube Data API v3)"); process.exit(1); }
async function yt(pathAndQuery: string, cost: number): Promise<any> {
  const r = await fetch(`${DATA}/${pathAndQuery}&key=${KEY}`);
  units += cost;
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${pathAndQuery.split("?")[0]}: ${j?.error?.message ?? r.statusText}`);
  return j;
}
const isoDur = (s: string) => { const m = s?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0; };

async function agentJson(role: "ideas" | "ideaQueries", prompt: string, logPath: string): Promise<{ json: any; costUsd: number; model: string }> {
  const model = roleModel(role, role === "ideas" ? flag("--agent") : undefined);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath.replace(/\.log$/, ".prompt.md"), prompt, "utf-8");
  if (isAgy(model)) return { json: (await runAgyJson({ prompt, model: agyModel(model), logPath }).catch(() => ({ json: null }))).json, costUsd: 0, model };
  const r = await runAgentAsync({ prompt, model, tools: ["Read"], maxTurns: 3, logPath, cwd: REPO });
  recordTiming(IDEAS_DIR, { step: `idea ${role} (${model})`, ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
  let json: any = null;
  try { json = extractJson(r.text); } catch {}
  return { json, costUsd: r.costUsd, model };
}

/** Channel context for the check: our uploads with numbers, and the projects in progress. */
function channelContext(): string {
  const snap = readSnapshot();
  const ups = (snap?.videos ?? []).map((v) => `- ${v.short ? "[short] " : ""}"${v.title}" (${v.publishedAt.slice(0, 10)}, ${Math.round(v.durationS / 60)} min): ${v.views} views${v.ctr !== undefined ? `, CTR ${(v.ctr * 100).toFixed(1)}%` : ""}${v.avgPct !== undefined ? `, ${Math.round(v.avgPct)}% viewed` : ""}${v.subsGained !== undefined ? `, +${v.subsGained} subs` : ""}`);
  const wip = workspaces().map((w) => {
    const first = readText(path.join(wsDir(w), "02-scripting/idea.md")).split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean);
    return first ? `- ${w}: ${first}` : null;
  }).filter(Boolean);
  return `## Uploads${snap ? ` (snapshot ${snap.fetchedAt.slice(0, 10)}, ${snap.channel.subs} subscribers)` : ""}\n${ups.join("\n") || "(no analytics snapshot)"}\n\n## Projects (workspaces, published or not)\n${wip.join("\n") || "(none)"}`;
}

async function competitors(queries: string[]): Promise<Competitor[]> {
  const after = new Date(Date.now() - 2 * 365 * 864e5).toISOString();
  const found = new Map<string, { query: string }>();
  for (const q of queries) {
    const j = await yt(`search?${new URLSearchParams({ part: "snippet", type: "video", q, maxResults: "25", order: "relevance", publishedAfter: after, relevanceLanguage: "en" })}`, 100);
    for (const it of j.items ?? []) if (it.id?.videoId && !found.has(it.id.videoId)) found.set(it.id.videoId, { query: q });
  }
  const ids = [...found.keys()];
  const vids: any[] = [];
  for (let i = 0; i < ids.length; i += 50) vids.push(...((await yt(`videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}`, 1)).items ?? []));
  const chIds = [...new Set(vids.map((v) => v.snippet.channelId))];
  const chans = new Map<string, any>();
  for (let i = 0; i < chIds.length; i += 50) for (const c of (await yt(`channels?part=statistics&id=${chIds.slice(i, i + 50).join(",")}`, 1)).items ?? []) chans.set(c.id, c.statistics);
  return vids.map((v) => {
    const c = chans.get(v.snippet.channelId) ?? {};
    const avg = Number(c.videoCount) > 0 ? Number(c.viewCount) / Number(c.videoCount) : 0;
    const views = Number(v.statistics?.viewCount ?? 0);
    return {
      ytId: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId, publishedAt: v.snippet.publishedAt,
      durationS: isoDur(v.contentDetails?.duration), views, channelSubs: Number(c.subscriberCount ?? 0), channelAvgViews: Math.round(avg),
      ratio: avg > 0 ? +(views / avg).toFixed(2) : 0, thumb: v.snippet.thumbnails?.medium?.url, query: found.get(v.id)!.query,
    };
  }).sort((a, b) => b.ratio - a.ratio);
}

async function research(idea: Idea): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logs = path.join(IDEAS_DIR, "logs", idea.id);
  let costUsd = 0;
  units = 0;
  console.log(`🔎 ${idea.id}: ${idea.title}`);

  // search words: the creator's, else two short queries from a cheap model (a full title is a poor search)
  let queries = idea.keywords.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (!queries.length) {
    const q = await agentJson("ideaQueries", `Give 2 short YouTube search queries (2–5 words each) a viewer would type to find videos on this topic. Different wording, same topic.\nIdea: ${idea.title}\n${idea.note}\nReply with ONLY: {"queries": ["...", "..."]}`, path.join(logs, `${stamp}_queries_${specSlug(roleModel("ideaQueries"))}.log`));
    costUsd += q.costUsd;
    queries = (Array.isArray(q.json?.queries) ? q.json.queries : []).map(String).filter(Boolean).slice(0, 2);
    if (!queries.length) queries = [idea.title.split(/\s+/).slice(0, 6).join(" ")];
  }
  console.log(`   searching: ${queries.map((q) => `"${q}"`).join(", ")}`);
  const comps = await competitors(queries);
  const top = comps.slice(0, 15);
  console.log(`   ${comps.length} videos found; top outliers: ${top.slice(0, 3).map((c) => `${c.ratio}× "${c.title.slice(0, 40)}"`).join(" · ") || "none"}`);

  const table = top.map((c) => `| ${c.title.replace(/\|/g, "/")} | ${c.channel.replace(/\|/g, "/")} | ${c.publishedAt.slice(0, 10)} | ${c.durationS <= 180 ? "short" : `${Math.round(c.durationS / 60)} min`} | ${c.views.toLocaleString()} | ${c.channelSubs.toLocaleString()} | ${c.channelAvgViews.toLocaleString()} | ${c.ratio} |`).join("\n");
  const prompt = `${readText(path.join(REPO, "workflow/prompts/IDEAS.md"))}

# Audience file
${readText(AUDIENCE_FILE)}

# Channel history
${channelContext()}

# Competition (YouTube search, last 2 years: ${queries.map((q) => `"${q}"`).join(", ")}; top ${top.length} of ${comps.length} by outlier ratio)
| title | channel | published | length | views | channel subs | channel avg views | ratio |
|---|---|---|---|---|---|---|---|
${table || "(no results)"}

# The idea
Title: ${idea.title}
Note: ${idea.note || "(none)"}
`;
  const v = await agentJson("ideas", prompt, path.join(logs, `${stamp}_check_${specSlug(roleModel("ideas", flag("--agent")))}.log`));
  costUsd += v.costUsd;
  const ok = v.json && typeof v.json.verdict === "string" && Array.isArray(v.json.packages);
  const r: Research = { at: new Date().toISOString(), queries, competitors: comps.slice(0, 25), verdict: ok ? v.json : null, model: v.model, costUsd, quotaUnits: units, ...(ok ? {} : { error: `the model returned no usable JSON (logs: ${path.relative(REPO, logs)})` }) };
  const s = readIdeas(), cur = s.ideas.find((x) => x.id === idea.id);
  if (!cur) return;
  cur.research = r;
  if (cur.status === "new") cur.status = "researched";
  writeIdeas(s);
  console.log(ok ? `   ✅ ${v.json.verdict.toUpperCase()} (fit ${v.json.fit?.score}/5, demand ${v.json.demand?.level}): ${v.json.summary}` : `   ⚠️  ${r.error}`);
  console.log(`   $${costUsd.toFixed(3)} · ${units} quota units`);
}

const s = readIdeas();
const pick = flag("--id") ? s.ideas.filter((i) => i.id === flag("--id")!.toUpperCase()) : args.includes("--all") ? s.ideas.filter((i) => !i.research && i.status !== "dropped") : [];
if (!pick.length) { console.error(flag("--id") ? `❌ no idea ${flag("--id")}` : "Usage: bun run ideas --add \"Title\" [--note ..] | --id I01 | --all"); process.exit(1); }
for (const i of pick) {
  try { await research(i); } catch (e) { console.error(`   ❌ ${i.id}: ${(e as Error).message}`); process.exitCode = 1; }
}
