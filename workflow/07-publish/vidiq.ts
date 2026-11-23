/**
 * Publish, with vidIQ (paid in vidIQ credits, run only when you start it): title scores + suggestions and AI thumbnails.
 * They sit beside the normal packaging, never replace it: metadata.json and thumbnails/A–C are not touched.
 *
 * Usage: bun run vidiq --video <ID> --titles [--no-suggest]   score the A/B/C titles (5 each) + 3 suggestions (5)
 *        bun run vidiq --video <ID> --thumb A|B|C|all          one AI thumbnail per variant (22 each), styled on our renders
 *        bun run vidiq --video <ID> --cost …                   print what it would cost and the balance, spend nothing
 * Writes: 07-publish/vidiq.json (scores, suggestions, thumbnails) and 07-publish/vidiq/<V>_<time>.png
 *
 * Never blocks: not connected, offline or too few credits → "vidIQ skipped: <reason>" and exit 0.
 * The balance is checked before anything is charged; vidIQ refunds a thumbnail that fails.
 */
import fs from "node:fs";
import path from "node:path";
import { withVidiq, COST, Skip, type Vidiq } from "../lib/vidiq";
import { VARIANTS, pubFile, readJson, readText, spokenText, thumbPath, wsDir, type Metadata, type Variant } from "./lib";

export interface TitleScore { title: string; score: number | null; note?: string }
export interface VidiqThumb { variant: Variant; file: string; imageUrl?: string; score?: number | null; feedback?: string; references: number; at: string }
export interface VidiqPublish {
  titles?: { at: string; scores: Partial<Record<Variant, TitleScore>>; suggestions: { title: string; score: number | null }[] };
  thumbs?: VidiqThumb[];
}

/** First number found under the usual score keys of a vidIQ reply (shapes differ between tools). */
export function scoreOf(v: any): number | null {
  for (const k of ["score", "overallScore", "titleScore", "thumbnailScore", "selfScore"]) {
    const n = Number(v?.[k]?.overall ?? v?.[k]);
    if (v?.[k] !== undefined && Number.isFinite(n)) return n;
  }
  return null;
}

/** The title suggestions in a generate_titles reply, whatever the list is called. */
export function suggestionsOf(v: any): { title: string; score: number | null }[] {
  const list = [v?.titles, v?.suggestions, v?.results, Array.isArray(v) ? v : null].find(Array.isArray) ?? [];
  return list.map((t: any) => (typeof t === "string" ? { title: t, score: null } : { title: String(t?.title ?? t?.text ?? ""), score: scoreOf(t) })).filter((t: { title: string }) => t.title);
}

/** The creative direction for one variant: its package brief, the exact words, and "look like the references". */
export function thumbQuery(p: { title: string; thumbnail?: string; thumbText?: string }, refs: number): string {
  return [
    `YouTube thumbnail for a faceless animated finance explainer titled "${p.title}".`,
    p.thumbnail ? `Concept: ${p.thumbnail}` : "",
    p.thumbText ? `The only words on the image: "${p.thumbText}" (spelled exactly). No other text, no fake numbers.` : "No text on the image.",
    refs ? "Match the look of the reference thumbnails closely: their palette, illustration style, character and composition language. They are this channel's own thumbnails." : "",
  ].filter(Boolean).join("\n");
}

const dataUri = (file: string) => `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${fs.readFileSync(file).toString("base64")}`;

/** This variant's own render first, then the other two: the style vidIQ should copy. */
function references(id: string, v: Variant): string[] {
  return [v, ...VARIANTS.filter((x) => x !== v)].map((x) => thumbPath(id, x)).filter((p): p is string => !!p);
}

async function scoreTitles(vq: Vidiq, meta: Metadata, suggest: boolean, channelId?: string): Promise<NonNullable<VidiqPublish["titles"]>> {
  await vq.spend(COST.scoreTitle * VARIANTS.length + (suggest ? COST.generateTitles : 0), "the title scores");
  const scores: Partial<Record<Variant, TitleScore>> = {};
  for (const v of VARIANTS) {
    const title = meta.titles[v]?.title;
    if (!title) continue;
    try {
      const r = await vq.call("vidiq_score_title", { title, type: "long", ...(channelId ? { channelId } : {}) });
      scores[v] = { title, score: scoreOf(r), note: typeof r?.feedback === "string" ? r.feedback : typeof r?.summary === "string" ? r.summary : undefined };
    } catch (e) { scores[v] = { title, score: null, note: `failed: ${(e as Error).message}` }; }
  }
  let suggestions: { title: string; score: number | null }[] = [];
  if (suggest) {
    try {
      const r = await vq.call("vidiq_generate_titles", { title: meta.titles.A.title, description: meta.description.slice(0, 5000), type: "long", numTitles: 3, previousTitles: VARIANTS.map((v) => meta.titles[v].title) }, 90_000);
      suggestions = suggestionsOf(r);
    } catch (e) { console.log(`   suggestions failed: ${(e as Error).message}`); }
  }
  return { at: new Date().toISOString(), scores, suggestions };
}

async function makeThumb(vq: Vidiq, id: string, meta: Metadata, v: Variant): Promise<VidiqThumb> {
  await vq.spend(COST.generateThumbnail, `thumbnail ${v}`);
  const p = meta.titles[v];
  const refs = references(id, v);
  const transcript = spokenText(readText(path.join(wsDir(id), "02-scripting/script_raw.md"))).slice(0, 20_000);
  const base = { title: p.title, userQuery: thumbQuery(p, refs.length), purpose: "thumbnail", orientation: "landscape", ...(transcript ? { transcript } : {}) };
  let job: any, used = refs.length;
  try {
    job = await vq.call("vidiq_generate_thumbnail", { ...base, ...(refs.length ? { referenceImages: refs.map(dataUri) } : {}) }, 120_000);
  } catch (e) {
    // a server that only takes hosted reference URLs: make it without them rather than not at all
    if (!refs.length) throw e;
    console.log(`   references refused (${(e as Error).message.slice(0, 120)}): making ${v} from the brief alone`);
    used = 0;
    job = await vq.call("vidiq_generate_thumbnail", { ...base, userQuery: thumbQuery(p, 0) }, 120_000);
  }
  const res = job?.mcpJobId ? await vq.job(job.mcpJobId) : job;
  const imageUrl: string | undefined = res?.imageUrl ?? res?.image?.url ?? res?.url;
  if (!imageUrl) throw new Error("vidIQ returned no image");
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`downloading the image: HTTP ${img.status}`);
  const ext = /jpe?g/.test(img.headers.get("content-type") ?? "") ? "jpg" : "png";
  const rel = `vidiq/${v}_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${ext}`;
  fs.mkdirSync(pubFile(id, "vidiq"), { recursive: true });
  fs.writeFileSync(pubFile(id, rel), Buffer.from(await img.arrayBuffer()));
  const fb = res?.feedback;
  return { variant: v, file: rel, imageUrl, score: scoreOf(res), feedback: typeof fb === "string" ? fb : fb ? JSON.stringify(fb) : undefined, references: used, at: new Date().toISOString() };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const id = flag("--video") ?? flag("-v");
  const thumbArg = flag("--thumb")?.toUpperCase();
  const titles = args.includes("--titles"), suggest = !args.includes("--no-suggest");
  if (!id || (!titles && !thumbArg)) {
    console.error("Usage: bun run vidiq --video <ID> --titles [--no-suggest] | --thumb A|B|C|all [--cost]");
    process.exit(1);
  }
  const variants: Variant[] = thumbArg === "ALL" ? [...VARIANTS] : thumbArg ? [thumbArg as Variant] : [];
  if (variants.some((v) => !VARIANTS.includes(v))) { console.error("❌ --thumb takes A, B, C or all"); process.exit(1); }
  const meta = readJson<Metadata>(pubFile(id, "metadata.json"));
  if (!meta) { console.log("vidIQ skipped: no titles yet (run Titles & description first)"); process.exit(0); }
  const cost = (titles ? COST.scoreTitle * 3 + (suggest ? COST.generateTitles : 0) : 0) + variants.length * COST.generateThumbnail;
  const outFile = pubFile(id, "vidiq.json");

  const r = await withVidiq(async (vq) => {
    const have = await vq.balance();
    console.log(`💳 vidIQ: ${have} credits; this run costs up to ${cost}`);
    if (args.includes("--cost")) return;
    if (have < cost && !variants.length) throw new Skip(`not enough vidIQ credits (have ${have}, need ${cost})`);
    const out = readJson<VidiqPublish>(outFile) ?? {};
    const keep = () => fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
    if (titles) {
      out.titles = await scoreTitles(vq, meta, suggest, process.env.WG_VIDIQ_CHANNEL);
      keep();
      for (const v of VARIANTS) { const s = out.titles.scores[v]; if (s) console.log(`   ${v} ${s.score ?? "?"} · ${s.title}${s.note ? `\n      ${s.note}` : ""}`); }
      for (const s of out.titles.suggestions) console.log(`   vidIQ suggests (${s.score ?? "?"}): ${s.title}`);
    }
    for (const v of variants) {
      // each thumbnail checks the balance again; one that fails or runs out does not stop the others' results being kept
      try {
        console.log(`🎨 thumbnail ${v} (${COST.generateThumbnail} credits, ~1–2 min)...`);
        const t = await makeThumb(vq, id, meta, v);
        out.thumbs = [...(out.thumbs ?? []), t];
        keep();
        console.log(`   ✅ ${t.file}${t.score != null ? ` (vidIQ self-score ${t.score}, rough)` : ""}${t.references ? `, styled on ${t.references} of our thumbnails` : ", no style references"}`);
      } catch (e) {
        console.log(`   ${v} skipped: ${(e as Error).message}`);
        if (e instanceof Skip) break;
      }
    }
  });
  if (!r.ok) console.log(`vidIQ skipped: ${r.reason}`);
  else if (!args.includes("--cost")) console.log(`→ ${path.relative(process.cwd(), outFile)}`);
}
