/**
 * Epidemic Sound candidate search (Partner Content API). Licence-gated: the free API key has NO commercial licence,
 * so this is for auditioning/choosing only. Nothing is downloaded here.
 *
 * bun run music:search --video <ID> --section <label> --mood calm,hopeful --bpm 80-100 [--term "..."] [--limit 8]
 * Auth: Authorization: Bearer ${EPIDEMIC_API} (Bun loads .env; the value is never printed).
 * Output: workspace/<ID>/06-audio/epidemic_candidates.json (merged per section label).
 * Self-test (prints only the HTTP status):
 *   bun -e 'const r=await fetch("https://api.epidemicsound.com/v0/moods",{headers:{Authorization:`Bearer ${process.env.EPIDEMIC_API}`}});console.log(r.status)'
 */
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, videoArg } from "./py";

const BASE = "https://api.epidemicsound.com";
const video = videoArg("music:search");
const a = process.argv.slice(2);
const opt = (n: string, d = "") => { const i = a.indexOf(n); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const section = opt("--section", "A01");
const moods = opt("--mood").split(",").map((s) => s.trim()).filter(Boolean);
const [bpmMin, bpmMax] = opt("--bpm").split("-").map(Number);
const limit = Math.min(60, Number(opt("--limit", "8")));
const term = opt("--term");
const key = process.env.EPIDEMIC_API;
if (!key) { console.error("[music:search] EPIDEMIC_API is not set (add it to .env)"); process.exit(1); }

async function api(p: string, q: Record<string, string | string[] | number | undefined> = {}) {
  const u = new URL(BASE + p);
  for (const [k, v] of Object.entries(q)) for (const x of ([] as any[]).concat(v ?? [])) if (x !== undefined && x !== "" && !Number.isNaN(x)) u.searchParams.append(k, String(x));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
  if ([401, 403, 429].includes(r.status)) {
    console.error(`[music:search] HTTP ${r.status} from ${p} (${r.status === 401 ? "bad or missing key" : r.status === 403 ? "no access with this key" : "rate limited"}). Stopping.`);
    process.exit(1);
  }
  if (!r.ok) { console.error(`[music:search] HTTP ${r.status} from ${p}`); process.exit(1); }
  return r.json() as Promise<any>;
}

// mood names -> ids (unmatched words become search terms)
const moodList = moods.length ? await api("/v0/moods") : { moods: [] };
const all: any[] = moodList.moods ?? moodList;
const ids: string[] = []; const rest: string[] = [];
for (const m of moods) {
  const hit = all.find((x: any) => String(x.name ?? x.id).toLowerCase() === m.toLowerCase() || String(x.id).toLowerCase() === m.toLowerCase());
  hit ? ids.push(hit.id) : rest.push(m);
}
const res = await api("/v0/tracks/search", { term: [term, ...rest].filter(Boolean).join(" ") || undefined, mood: ids, bpmMin, bpmMax, limit, filterBehaviour: "anyOf", sort: "Relevance" });
const cands = [];
for (const t of res.tracks ?? []) {
  let preview: string | null = null;
  try { preview = (await api(`/v0/tracks/${encodeURIComponent(t.id)}/stream`)).url ?? null; } catch { /* keep null */ }
  cands.push({
    trackId: t.id, title: t.title, artists: [...(t.mainArtists ?? []), ...(t.featuredArtists ?? [])], bpm: t.bpm,
    moods: (t.moods ?? []).map((m: any) => m.name), genres: (t.genres ?? []).map((g: any) => g.name), durationSec: t.length,
    tier: t.tierOption, hasVocals: t.hasVocals, previewUrl: preview, previewOnly: t.isPreviewOnly,
  });
  await new Promise((r) => setTimeout(r, 250));
}
const out = path.join(REPO_ROOT, "workspace", video, "06-audio", "epidemic_candidates.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf-8")) : {};
prev[section] = { query: { moods, bpm: opt("--bpm"), term }, retrieved: new Date().toISOString(), candidates: cands };
fs.writeFileSync(out, JSON.stringify(prev, null, 2));
for (const c of cands) console.log(`${c.trackId}  ${String(c.bpm).padStart(3)} bpm  ${String(c.durationSec).padStart(4)}s  ${c.title} - ${c.artists.join(", ")}  [${c.moods.join("/")}]`);
console.log(`[music:search] ${cands.length} candidates for ${section} -> ${path.relative(REPO_ROOT, out)}`);
console.log(`Use one: edit 06-audio/music.json section ${section} source -> {"type":"epidemic","trackId":"<id>"} (downloads only with EPIDEMIC_COMMERCIAL=1)`);
