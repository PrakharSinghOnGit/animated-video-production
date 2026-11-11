/**
 * Pull every comment on the channel (read-only) and draft suggested replies with a small model. Nothing is posted:
 * you polish a draft and reply in YouTube Studio (each entry links straight to the comment).
 *
 * Usage: bun run yt:comments [--no-draft] [--redraft] [--offline] [--agent haiku] [--all]
 *   --no-draft   only fetch
 *   --redraft    draft again for comments that already have a draft (your status marks and edited drafts are kept)
 *   --offline    skip the API: draft and rebuild comments.md from the saved comments.json
 *   --all        list handled comments in comments.md too (default: only ones still waiting on you)
 *
 * Files (workspace/_analytics/):
 *   comments.json   every top-level comment + its replies, triage and draft; `status` is yours to set
 *                   ("todo" | "done" | "skip"), a comment the channel already replied to becomes "done" on fetch
 *   comments.md     the inbox to read: newest first, draft + things to check + link
 *   comments/       prompts and logs of the drafting runs
 *
 * Cost: Data API commentThreads.list with allThreadsRelatedToChannelId, 1 quota unit per 100 threads, plus 1 unit per
 * 50 videos for titles/descriptions. Reads with YOUTUBE_API_KEY (.env): public comments only, and a key can never post.
 * (OAuth fallback: Google requires the youtube.force-ssl scope even to list comments, which yt:auth does not request.)
 * Video context for the drafts: title + description, plus the script when the video is linked to a workspace
 * (07-publish/youtube.json in a VID or shorts/S* folder).
 */
import fs from "node:fs";
import path from "node:path";
import { runAgentAsync, runAgyJson, extractJson } from "../05-video/src/lib/agent";
import { roleModel, isAgy, agyModel, specSlug } from "../lib/models";
import { recordTiming, formatDuration } from "../05-video/src/lib/timings";
import { DIR, REPO, gapi, readJson, readText, workspaces, wsDir, writeJson } from "./lib";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const DATA = "https://www.googleapis.com/youtube/v3";
const FILE = path.join(DIR, "comments.json");
const MD = path.join(DIR, "comments.md");
const BATCH = 30;

export type Kind = "praise" | "question" | "addition" | "disagreement" | "factual" | "quality" | "troll" | "spam";
export interface Reply { id: string; author: string; text: string; at: string; mine: boolean }
export interface Comment {
  id: string; videoId: string; author: string; text: string; at: string; likes: number;
  replies: Reply[]; repliedByMe: boolean;
  status: "todo" | "done" | "skip";
  /** `edited`: you saved your own draft (dashboard); --redraft leaves it alone */
  triage?: { kind: Kind; reply: boolean; heart: boolean; summary: string; draft: string; check: string; model: string; at: string; edited?: boolean };
}
export interface Store { fetchedAt: string; channelId: string; videos: Record<string, { title: string; short: boolean; ws?: string; description?: string }>; comments: Record<string, Comment> }

const plain = (html: string) => html.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const isoDur = (s: string) => { const m = s?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : 0; };
export const commentUrl = (c: Comment) => `https://www.youtube.com/watch?v=${c.videoId}&lc=${c.id}`;

/** ytId → workspace dir (relative to workspace/), shorts included. */
function links(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of workspaces()) {
    const dirs = [w, ...(() => { try { return fs.readdirSync(path.join(wsDir(w), "shorts")).filter((s) => /^S\d+$/.test(s)).map((s) => `${w}/shorts/${s}`); } catch { return []; } })()];
    for (const d of dirs) { const id = readJson<{ videoId: string }>(path.join(REPO, "workspace", d, "07-publish/youtube.json"))?.videoId; if (id) out[id] = d; }
  }
  return out;
}

// ───────────── fetch ─────────────

const t0 = Date.now();
const prev = readJson<Store>(FILE);
// Comment reads need youtube.force-ssl (a scope that can also post), so read with an API key instead: it sees public
// comments only (not ones held for review) and can never write. Without a key, fall back to OAuth.
const KEY = process.env.YOUTUBE_API_KEY;
async function get(url: string): Promise<any> {
  if (!KEY) return gapi(url).catch((e) => {
    if (/insufficient authentication scopes/i.test(String(e))) {
      console.error("❌ reading comments needs YOUTUBE_API_KEY in .env (read-only): Google Cloud → APIs & Services → Credentials → Create credentials → API key, restricted to YouTube Data API v3");
      process.exit(1);
    }
    throw e;
  });
  const r = await fetch(`${url}&key=${KEY}`);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${url.replace(/\?.*/, "")}: ${j?.error?.message ?? r.statusText}`);
  return j;
}
async function fetchAll(): Promise<Store> {
console.log(`💬 Fetching comments (${KEY ? "API key, read-only" : "OAuth"})…`);
let units = 0;
let chId = readJson<{ channel: { id: string } }>(path.join(DIR, "snapshot.json"))?.channel?.id ?? prev?.channelId;
if (!chId) { chId = (await gapi(`${DATA}/channels?part=id&mine=true`)).items?.[0]?.id; units += 1; }
if (!chId) { console.error("❌ no channel id: run bun run yt:fetch first (or bun run yt:auth with the channel's account)"); process.exit(1); }
const ch = { id: chId };

const comments: Record<string, Comment> = {};
let page = "";
do {
  const j = await get(`${DATA}/commentThreads?${new URLSearchParams({ part: "snippet,replies", allThreadsRelatedToChannelId: ch.id, maxResults: "100", textFormat: "html", order: "time", ...(page ? { pageToken: page } : {}) })}`);
  units += 1;
  for (const t of j.items ?? []) {
    const top = t.snippet.topLevelComment;
    const s = top.snippet;
    const replies: Reply[] = (t.replies?.comments ?? []).map((r: any) => ({
      id: r.id, author: r.snippet.authorDisplayName, text: plain(r.snippet.textDisplay), at: r.snippet.publishedAt,
      mine: r.snippet.authorChannelId?.value === ch.id,
    })).sort((a: Reply, b: Reply) => a.at.localeCompare(b.at));
    const old = prev?.comments[top.id];
    const repliedByMe = replies.some((r) => r.mine);
    const mineTop = s.authorChannelId?.value === ch.id;
    comments[top.id] = {
      id: top.id, videoId: t.snippet.videoId, author: s.authorDisplayName, text: plain(s.textDisplay), at: s.publishedAt, likes: s.likeCount ?? 0,
      replies, repliedByMe,
      // the thread's API snapshot shows at most 5 replies; a reply you posted later still counts once seen
      status: repliedByMe || mineTop ? "done" : (old?.status ?? "todo"),
      triage: old?.triage,
    };
  }
  page = j.nextPageToken ?? "";
} while (page);

// titles + descriptions of the commented videos
const vids = [...new Set(Object.values(comments).map((c) => c.videoId))];
const linkMap = links();
const videos: Store["videos"] = {};
for (let i = 0; i < vids.length; i += 50) {
  const j = await get(`${DATA}/videos?part=snippet,contentDetails&id=${vids.slice(i, i + 50).join(",")}`);
  units += 1;
  for (const v of j.items ?? []) {
    const d = isoDur(v.contentDetails?.duration);
    videos[v.id] = { title: v.snippet.title, short: d > 0 && d <= 180, ws: linkMap[v.id], description: v.snippet.description ?? "" };
  }
}

console.log(`   ${Object.keys(comments).length} comments on ${vids.length} videos · ${units} quota units`);
return { fetchedAt: new Date().toISOString(), channelId: ch.id, videos, comments };
}

const offline = args.includes("--offline");
if (offline && !prev) { console.error("❌ --offline needs an earlier comments.json"); process.exit(1); }
if (offline) console.log("💬 Using the saved comments (--offline)");
const store: Store = offline ? prev! : await fetchAll();
const { videos, comments } = store;
const all = Object.values(comments);
const fresh = offline ? 0 : all.filter((c) => !prev?.comments[c.id]).length;
console.log(`   ${fresh} new, ${all.filter((c) => c.status === "todo").length} waiting on you`);

// ───────────── draft ─────────────

let costUsd = 0;
const agent = roleModel("commentReplies", flag("--agent"));
const pending = all.filter((c) => c.status === "todo" && !c.triage?.edited && (args.includes("--redraft") || !c.triage));
if (args.includes("--no-draft") || !pending.length) {
  if (!pending.length) console.log("   no comments need a draft");
} else {
  const out = path.join(DIR, "comments");
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = readText(path.join(REPO, "workflow/prompts/COMMENT_REPLIES.md"));
  console.log(`✍️  Drafting ${pending.length} replies with ${agent}…`);
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const ctx = [...new Set(batch.map((c) => c.videoId))].map((id) => {
      const v = videos[id];
      const script = v?.ws ? readText(path.join(REPO, "workspace", v.ws, "02-scripting/script_raw.md")).slice(0, 14000) : "";
      return `## Video ${id}: "${v?.title ?? "(unknown)"}"${v?.short ? " (a Short)" : ""}
### Description
${(v?.description ?? "").slice(0, 3000) || "(none)"}
${script ? `### Script (narration and on-screen notes)\n${script}` : "### Script\n(not linked to a workspace: use only the title and description)"}`;
    }).join("\n\n");
    const list = batch.map((c) => `- id: ${c.id}
  video: ${c.videoId}
  author: ${c.author}
  posted: ${c.at.slice(0, 10)}, ${c.likes} likes
  comment: ${JSON.stringify(c.text)}${c.replies.length ? `\n  thread so far: ${JSON.stringify(c.replies.map((r) => `${r.mine ? "(channel)" : r.author}: ${r.text}`))}` : ""}`).join("\n");
    const prompt = `${base}\n\n# Video context\n${ctx}\n\n# Comments\n${list}\n`;
    const logPath = path.join(out, `${stamp}_${i / BATCH + 1}_${specSlug(agent)}.log`);
    fs.writeFileSync(logPath.replace(/\.log$/, ".prompt.md"), prompt, "utf-8");
    let json: any = null;
    if (isAgy(agent)) {
      json = (await runAgyJson({ prompt, model: agyModel(agent), logPath }).catch(() => ({ json: null }))).json;
    } else {
      const r = await runAgentAsync({ prompt, model: agent, tools: ["Read"], maxTurns: 3, logPath, cwd: REPO });
      try { json = extractJson(r.text); } catch {}
      costUsd += r.costUsd;
      recordTiming(DIR, { step: `comment drafts (${agent})`, ms: r.durationMs, model: agent, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
    }
    const got = Array.isArray(json?.comments) ? json.comments : [];
    if (!got.length) console.error(`   ⚠️  batch ${i / BATCH + 1}: no usable JSON (log: ${path.relative(REPO, logPath)})`);
    for (const g of got) {
      const c = comments[g?.id];
      if (!c) continue;
      c.triage = {
        kind: g.kind, reply: !!g.reply, heart: !!g.heart, summary: String(g.summary ?? ""), draft: String(g.draft ?? ""),
        check: String(g.check ?? ""), model: agent, at: new Date().toISOString(),
      };
    }
  }
}
writeJson(FILE, store);

// ───────────── inbox ─────────────

const showAll = args.includes("--all");
const rows = all.filter((c) => showAll || c.status === "todo").sort((a, b) => b.at.localeCompare(a.at));
const counts = all.reduce<Record<string, number>>((m, c) => { const k = c.triage?.kind ?? "untriaged"; m[k] = (m[k] ?? 0) + 1; return m; }, {});
const quality = all.filter((c) => c.triage?.kind === "quality" || c.triage?.kind === "factual");
const md = `# Comments inbox

Fetched ${store.fetchedAt.slice(0, 16).replace("T", " ")} UTC · ${all.length} comments · ${rows.length} ${showAll ? "listed" : "waiting on you"}
Kinds: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(" · ")}
${quality.length ? `\n**Quality / factual (production feedback, look for repeats):**\n${quality.map((c) => `- ${videos[c.videoId]?.title ?? c.videoId}: ${c.triage!.summary}`).join("\n")}\n` : ""}
Drafts are suggestions: rewrite them in your voice, check the ⚠️ items, reply in Studio, then set \`status\` to "done"
or "skip" in comments.json (a comment you've replied to is marked done on the next fetch anyway).

${rows.map((c) => {
  const v = videos[c.videoId];
  const t = c.triage;
  return `---
### ${c.author} on "${v?.title ?? c.videoId}"${v?.short ? " (Short)" : ""}
${c.at.slice(0, 10)} · ${c.likes} likes${t ? ` · **${t.kind}**${t.heart ? " · ❤️ heart it" : ""}${t.reply ? "" : " · no reply needed"}` : ""} · [open](${commentUrl(c)})

> ${c.text.replace(/\n/g, "\n> ")}
${c.replies.map((r) => `\n>> **${r.mine ? "You" : r.author}:** ${r.text.replace(/\n/g, " ")}`).join("")}
${t?.draft ? `\n**Draft:** ${t.draft}\n` : ""}${t?.check ? `\n⚠️ ${t.check}\n` : ""}`;
}).join("\n")}`;
fs.writeFileSync(MD, md, "utf-8");
console.log(`✅ ${path.relative(REPO, MD)}${costUsd ? ` · $${costUsd.toFixed(3)}` : ""} · ${formatDuration(Date.now() - t0)}`);
