/**
 * Idea check: is an idea worth a video? Searches YouTube for the topic (who already covered it, which videos beat
 * their channel's usual reach: views ÷ the median of the channel's recent same-format uploads, yt-viral), then a model judges the idea against workflow/01-ideation/AUDIENCE.md, the channel's
 * own uploads and numbers, and drafts three packages (title + thumbnail). Result: workspace/_ideas/ideas.json.
 *
 * Usage:
 *   bun run ideas --add "Title" [--note "..."] [--keywords "search words"]   add an idea (no research)
 *   bun run ideas --id I03 [--agent sonnet]                                    research one idea
 *   bun run ideas --all                                                        research every idea not researched yet
 *   bun run ideas --to-workspace I03 VID07_Name                                write the idea into the project's idea.md
 *   bun run ideas --discover [--focus "housing, taxes"] [--check 3]            find ideas: recent outliers in the niche → ranked
 *                                                                              ideas in the bank (+ the full check of the top N)
 *
 * Cost per idea: 2 YouTube searches (100 quota units each, of 10,000 a day) + ~2 units for video/channel stats +
 * ~1 unit per competing channel and ~1 per 50 of their recent uploads (the channel medians, yt-viral/swipe.py);
 * a cheap model picks the search words (role ideaQueries, Haiku), the check runs on role ideas (Sonnet by default).
 * Needs YOUTUBE_API_KEY in .env.
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming } from "../05-video/src/lib/timings";
import { readSnapshot, workspaces, wsDir, readText } from "../09-analytics/lib";
import { lintTitle, swipe, type SwipeRow } from "./skills";
import { AUDIENCE_FILE, IDEAS_DIR, REPO, ideaMarkdown, nextIdeaId, readIdeas, writeIdeas, type Competitor, type Found, type Idea, type Research } from "./lib";

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
  // the check may lint its package candidates with yt-package/title.py (the queries step needs no tools)
  const tools = role === "ideas" ? ["Read", "Bash(python3 workflow/01-ideation/yt-package/title.py:*)"] : ["Read"];
  const r = await runAgentAsync({ prompt, model, tools, maxTurns: role === "ideas" ? 12 : 3, logPath, cwd: REPO });
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

const isShort = (durationS: number) => durationS <= 180;
/** below this median (views per recent upload) a channel's multiples are noise */
const TINY_MEDIAN = 100;

/** Recent uploads of each channel (playlistItems, 1 unit per channel; videos, 1 unit per 50) for the medians. */
async function channelUploads(uploadsPlaylist: Map<string, string>): Promise<{ id: string; channelId: string; title: string; views: number; durationS: number }[]> {
  const ids: { id: string; channelId: string }[] = [];
  const chans = [...uploadsPlaylist];
  for (let i = 0; i < chans.length; i += 8) {
    await Promise.all(chans.slice(i, i + 8).map(async ([channelId, pl]) => {
      try {
        const j = await yt(`playlistItems?part=contentDetails&maxResults=25&playlistId=${pl}`, 1);
        for (const it of j.items ?? []) if (it.contentDetails?.videoId) ids.push({ id: it.contentDetails.videoId, channelId });
      } catch {} // a channel with hidden uploads: it falls back to the lifetime average
    }));
  }
  const out: { id: string; channelId: string; title: string; views: number; durationS: number }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    for (const v of (await yt(`videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).map((x) => x.id).join(",")}`, 1)).items ?? [])
      out.push({ id: v.id, channelId: v.snippet.channelId, title: v.snippet.title, views: Number(v.statistics?.viewCount ?? 0), durationS: isoDur(v.contentDetails?.duration) });
  }
  return out;
}

async function competitors(queries: string[], o: { days?: number; order?: "relevance" | "viewCount"; perQuery?: number } = {}): Promise<Competitor[]> {
  const after = new Date(Date.now() - (o.days ?? 730) * 864e5).toISOString();
  const found = new Map<string, { query: string }>();
  for (const q of queries) {
    const j = await yt(`search?${new URLSearchParams({ part: "snippet", type: "video", q, maxResults: String(o.perQuery ?? 25), order: o.order ?? "relevance", publishedAfter: after, relevanceLanguage: "en" })}`, 100);
    for (const it of j.items ?? []) if (it.id?.videoId && !found.has(it.id.videoId)) found.set(it.id.videoId, { query: q });
  }
  const ids = [...found.keys()];
  const vids: any[] = [];
  for (let i = 0; i < ids.length; i += 50) vids.push(...((await yt(`videos?part=snippet,statistics,contentDetails&id=${ids.slice(i, i + 50).join(",")}`, 1)).items ?? []));
  const chIds = [...new Set(vids.map((v) => v.snippet.channelId))];
  const chans = new Map<string, any>();
  const uploads = new Map<string, string>();
  for (let i = 0; i < chIds.length; i += 50) for (const c of (await yt(`channels?part=statistics,contentDetails&id=${chIds.slice(i, i + 50).join(",")}`, 1)).items ?? []) {
    chans.set(c.id, c.statistics);
    if (c.contentDetails?.relatedPlaylists?.uploads) uploads.set(c.id, c.contentDetails.relatedPlaylists.uploads);
  }
  const comps: Competitor[] = vids.map((v) => {
    const c = chans.get(v.snippet.channelId) ?? {};
    const avg = Number(c.videoCount) > 0 ? Number(c.viewCount) / Number(c.videoCount) : 0;
    const views = Number(v.statistics?.viewCount ?? 0);
    return {
      ytId: v.id, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId, publishedAt: v.snippet.publishedAt,
      durationS: isoDur(v.contentDetails?.duration), views, channelSubs: Number(c.subscriberCount ?? 0), channelAvgViews: Math.round(avg),
      ratio: avg > 0 ? +(views / avg).toFixed(2) : 0, thumb: v.snippet.thumbnails?.medium?.url, query: found.get(v.id)!.query,
    };
  });

  // yt-viral: each video against the median of its channel's recent uploads of the same format. A lifetime average
  // is pulled up by one viral hit and mixes shorts with long videos; a recent same-format median is the channel's
  // normal reach for this kind of video.
  try {
    const rows = new Map<string, SwipeRow>();
    const key = (channelId: string, durationS: number) => `${channelId}|${isShort(durationS) ? "short" : "long"}`;
    for (const u of await channelUploads(uploads)) rows.set(u.id, { channel: key(u.channelId, u.durationS), title: u.title, views: u.views, url: u.id, duration: u.durationS });
    for (const c of comps) rows.set(c.ytId, { channel: key(c.channelId, c.durationS), title: c.title, views: c.views, url: c.ytId, duration: c.durationS });
    const n = new Map<string, number>();
    for (const r of rows.values()) n.set(r.channel, (n.get(r.channel) ?? 0) + 1);
    const hits = new Map(swipe([...rows.values()]).outliers.map((h) => [h.url, h]));
    for (const c of comps) {
      const h = hits.get(c.ytId);
      if (h) Object.assign(c, { median: h.median, multiple: h.multiple, formula: h.formula, sampleN: n.get(key(c.channelId, c.durationS)) });
    }
  } catch (e) { console.warn(`   ⚠️  channel medians skipped: ${(e as Error).message}`); }
  // a channel whose recent videos get a handful of views turns 30 views into "30×": rank those after the rest
  const tiny = (c: Competitor) => (c.median ?? c.channelAvgViews) < TINY_MEDIAN;
  return comps.sort((a, b) => Number(tiny(a)) - Number(tiny(b)) || (b.multiple ?? b.ratio) - (a.multiple ?? a.ratio));
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
  const mult = (c: Competitor) => c.multiple ?? c.ratio;
  console.log(`   ${comps.length} videos found; top outliers: ${top.slice(0, 3).map((c) => `${mult(c)}× "${c.title.slice(0, 40)}"`).join(" · ") || "none"}`);
  const fc = new Map<string, number>();
  for (const c of comps) if (c.formula && c.formula !== "Unclassified" && (c.median ?? 0) >= TINY_MEDIAN && (c.multiple ?? 0) >= 2) fc.set(c.formula, (fc.get(c.formula) ?? 0) + 1);
  const formulas = [...fc].map(([formula, n]) => ({ formula, n })).sort((a, b) => b.n - a.n);

  const table = top.map((c) => `| ${c.title.replace(/\|/g, "/")} | ${c.channel.replace(/\|/g, "/")} | ${c.publishedAt.slice(0, 10)} | ${c.durationS <= 180 ? "short" : `${Math.round(c.durationS / 60)} min`} | ${c.views.toLocaleString()} | ${c.channelSubs.toLocaleString()} | ${c.median !== undefined ? `${c.median.toLocaleString()} (${c.sampleN} uploads)${c.median < TINY_MEDIAN ? ", tiny channel: multiple is noise" : ""}` : `n/a (lifetime avg ${c.channelAvgViews.toLocaleString()})`} | ${mult(c)} | ${c.formula ?? ""} |`).join("\n");
  const prompt = `${readText(path.join(REPO, "workflow/prompts/IDEAS.md"))}

# Audience file
${readText(AUDIENCE_FILE)}

# Channel history
${channelContext()}

# Competition (YouTube search, last 2 years: ${queries.map((q) => `"${q}"`).join(", ")}; top ${top.length} of ${comps.length} by multiple)
The multiple is views ÷ the median views of the channel's recent uploads of the same format (long or short); where
the channel had under 4 such uploads it falls back to views ÷ the channel's lifetime average. Channels whose median
is under ${TINY_MEDIAN} views are listed last: their multiples are noise. The formula is the
hook formula the title matches (a judgement about the words, not why the video worked).
| title | channel | published | length | views | channel subs | channel median | multiple | title formula |
|---|---|---|---|---|---|---|---|---|
${table || "(no results)"}
${formulas.length ? `\nFormulas among the outliers (multiple ≥ 2, channels with a median of ${TINY_MEDIAN}+): ${formulas.map((f) => `${f.formula} ×${f.n}`).join(", ")}\n` : ""}
# The idea
Title: ${idea.title}
Note: ${idea.note || "(none)"}
`;
  const v = await agentJson("ideas", prompt, path.join(logs, `${stamp}_check_${specSlug(roleModel("ideas", flag("--agent")))}.log`));
  costUsd += v.costUsd;
  const ok = v.json && typeof v.json.verdict === "string" && Array.isArray(v.json.packages);
  // the editor ran title.py itself; lint the packages it handed back again so the stored score is the tool's, not its claim
  if (ok) for (const pk of v.json.packages) {
    try { const l = lintTitle(String(pk.title ?? ""), typeof pk.thumbText === "string" ? pk.thumbText : undefined); pk.lint = { score: l.score, chars: l.chars, issues: l.issues, good: l.good }; }
    catch (e) { console.warn(`   ⚠️  title check: ${(e as Error).message}`); }
  }
  const r: Research = { at: new Date().toISOString(), queries, competitors: comps.slice(0, 25), formulas, verdict: ok ? v.json : null, model: v.model, costUsd, quotaUnits: units, ...(ok ? {} : { error: `the model returned no usable JSON (logs: ${path.relative(REPO, logs)})` }) };
  const s = readIdeas(), cur = s.ideas.find((x) => x.id === idea.id);
  if (!cur) return;
  cur.research = r;
  if (cur.status === "new") cur.status = "researched";
  writeIdeas(s);
  console.log(ok ? `   ✅ ${v.json.verdict.toUpperCase()} (fit ${v.json.fit?.score}/5, demand ${v.json.demand?.level}): ${v.json.summary}` : `   ⚠️  ${r.error}`);
  console.log(`   $${costUsd.toFixed(3)} · ${units} quota units`);
}

// ───────────── discover: find ideas from what is working in the niche now ─────────────

async function discover(focus: string, checkTop: number): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logs = path.join(IDEAS_DIR, "logs", "discover");
  let costUsd = 0;
  units = 0;
  const bank = readIdeas().ideas;
  console.log(`🧭 Finding ideas${focus ? ` (focus: ${focus})` : ""}`);

  // 1. search words across the audience's topics (or the creator's focus): a cheap model, from the brief and history
  const q = await agentJson("ideaQueries", `You pick YouTube searches to find what is working right now for a channel. Read the audience brief and the channel history below. Give 5 short YouTube search queries (2–5 words) a viewer of this channel would type, each on a DIFFERENT topic inside the channel's promise${focus ? `, centred on this focus: ${focus}` : ""}. Not the channel's own past topics word for word. Reply with ONLY {"queries": ["...", ...]}.

# Audience brief
${readText(AUDIENCE_FILE)}

# Channel history
${channelContext()}`, path.join(logs, `${stamp}_queries_${specSlug(roleModel("ideaQueries"))}.log`));
  costUsd += q.costUsd;
  const queries: string[] = (Array.isArray(q.json?.queries) ? q.json.queries : []).map(String).filter(Boolean).slice(0, 5);
  if (!queries.length) throw new Error("the query model gave no searches");
  console.log(`   searching (last 6 months, most viewed): ${queries.map((x) => `"${x}"`).join(", ")}`);

  // 2. recent most-viewed videos for each, scored against their own channel's recent median (yt-viral)
  const comps = await competitors(queries, { days: 180, order: "viewCount", perQuery: 25 });
  const real = comps.filter((c) => (c.median ?? 0) >= TINY_MEDIAN && c.multiple !== undefined);
  let outliers = real.filter((c) => c.multiple! >= 3);
  const relaxed = outliers.length < 12;
  if (relaxed) outliers = real.filter((c) => c.multiple! >= 1.5);
  outliers = outliers.slice(0, 40);
  console.log(`   ${comps.length} videos, ${outliers.length} outliers (≥${relaxed ? "1.5" : "3"}× their channel's median)`);
  if (!outliers.length) throw new Error("no outliers found: try a focus");
  const table = outliers.map((c) => `| ${c.ytId} | ${c.title.replace(/\|/g, "/")} | ${c.channel.replace(/\|/g, "/")} | ${c.publishedAt.slice(0, 10)} | ${isShort(c.durationS) ? "short" : `${Math.round(c.durationS / 60)} min`} | ${c.views.toLocaleString()} | ${c.median!.toLocaleString()} | ${c.multiple} | ${c.formula ?? ""} |`).join("\n");

  // 3. the editor turns the outliers into ranked ideas for this audience
  const prompt = `${readText(path.join(REPO, "workflow/prompts/IDEA_DISCOVER.md"))}

# Audience file
${readText(AUDIENCE_FILE)}

# Channel history
${channelContext()}

# Ideas already in the bank (don't repeat them)
${bank.map((i) => `- ${i.id} [${i.status}${i.research?.verdict ? `, ${i.research.verdict.verdict}` : ""}]: ${i.title}`).join("\n") || "(none)"}

# Outliers (YouTube search, last 6 months, most viewed: ${queries.map((x) => `"${x}"`).join(", ")})
Multiple = views ÷ the median views of the channel's recent uploads of the same format. Formula = the title's hook formula.
| id | title | channel | published | length | views | channel median | multiple | formula |
|---|---|---|---|---|---|---|---|---|
${table}
${focus ? `\n# The creator's focus\n${focus}\n` : ""}`;
  const v = await agentJson("ideas", prompt, path.join(logs, `${stamp}_ideas_${specSlug(roleModel("ideas", flag("--agent")))}.log`));
  costUsd += v.costUsd;
  const found: any[] = Array.isArray(v.json?.ideas) ? v.json.ideas : [];
  if (!found.length) throw new Error(`the model returned no ideas (logs: ${path.relative(REPO, logs)})`);

  // 4. into the bank, ranked: the editor's fit and demand, demand capped when no real outlier stands behind it
  const byId = new Map(comps.map((c) => [c.ytId, c]));
  const at = new Date().toISOString();
  const rows = found.filter((f) => typeof f?.title === "string" && f.title.trim()).map((f) => {
    const insp = (Array.isArray(f.inspiredBy) ? f.inspiredBy : []).map(String).map((id: string) => byId.get(id)).filter(Boolean) as Competitor[];
    const fit = Math.max(1, Math.min(5, Number(f.fit) || 1));
    const demand = insp.length ? Math.max(1, Math.min(5, Number(f.demand) || 1)) : Math.min(3, Math.max(1, Number(f.demand) || 1));
    const best = Math.max(1, ...insp.map((c) => c.multiple ?? 1));
    // 0–10: fit weighs a little more than demand (an off-brand hit doesn't grow this channel), +up to 1 for a big outlier
    const score = +Math.min(10, (fit * 0.55 + demand * 0.45) * 1.8 + Math.min(1, Math.log10(best) / 2)).toFixed(1);
    let pkg: Found["package"];
    if (f.package?.title) {
      pkg = { title: String(f.package.title), thumbnail: String(f.package.thumbnail ?? ""), thumbText: f.package.thumbText ? String(f.package.thumbText) : undefined };
      try { const l = lintTitle(pkg.title, pkg.thumbText); pkg.lint = { score: l.score, chars: l.chars, issues: l.issues, good: l.good }; } catch {}
    }
    return { f, insp, fit, demand, score, pkg };
  }).sort((a, b) => b.score - a.score);

  const st = readIdeas();
  const added: Idea[] = [];
  rows.forEach((r, k) => {
    const idea: Idea = {
      id: nextIdeaId(st), title: r.f.title.trim().slice(0, 200), note: String(r.f.note ?? "").slice(0, 4000), keywords: String(r.f.keywords ?? "").slice(0, 200),
      status: "new", createdAt: at,
      found: {
        at, rank: k + 1, score: r.score, fit: r.fit, demand: r.demand, why: String(r.f.why ?? ""), risk: String(r.f.risk ?? ""), focus,
        inspiredBy: r.insp.map((c) => ({ ytId: c.ytId, title: c.title, channel: c.channel, views: c.views, multiple: c.multiple ?? null })), package: r.pkg,
      },
    };
    st.ideas.push(idea);
    added.push(idea);
  });
  writeIdeas(st);
  fs.mkdirSync(path.join(IDEAS_DIR, "discover"), { recursive: true });
  fs.writeFileSync(path.join(IDEAS_DIR, "discover", `${stamp}.json`), JSON.stringify({ at, focus, queries, outliers, patterns: v.json?.patterns ?? "", ideas: added.map((i) => i.id), costUsd, quotaUnits: units }, null, 1));
  if (v.json?.patterns) console.log(`   what the outliers share: ${v.json.patterns}`);
  for (const i of added) console.log(`   ${i.found!.rank}. ${i.id} ${i.found!.score}/10 (fit ${i.found!.fit}, demand ${i.found!.demand}): ${i.title}`);
  console.log(`   $${costUsd.toFixed(3)} · ${units} quota units`);

  // 5. optionally the full check (audience test, competition for that exact idea, 3 linted packages) of the best ones
  for (const i of added.slice(0, checkTop)) {
    try { await research(i); } catch (e) { console.error(`   ❌ ${i.id}: ${(e as Error).message}`); process.exitCode = 1; }
  }
}

if (args.includes("--discover")) {
  try { await discover((flag("--focus") ?? "").trim().slice(0, 300), Math.max(0, Math.min(5, Number(flag("--check") ?? 0) || 0))); }
  catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
  process.exit(process.exitCode ?? 0);
}

const s = readIdeas();
const pick = flag("--id") ? s.ideas.filter((i) => i.id === flag("--id")!.toUpperCase()) : args.includes("--all") ? s.ideas.filter((i) => !i.research && i.status !== "dropped") : [];
if (!pick.length) { console.error(flag("--id") ? `❌ no idea ${flag("--id")}` : "Usage: bun run ideas --add \"Title\" [--note ..] | --id I01 | --all"); process.exit(1); }
for (const i of pick) {
  try { await research(i); } catch (e) { console.error(`   ❌ ${i.id}: ${(e as Error).message}`); process.exitCode = 1; }
}
