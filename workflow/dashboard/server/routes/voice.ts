/** Voice and Align: the pause picker (hold points, the holds list) and the per-section voice review. */
import fs from "node:fs";
import path from "node:path";
import { bad, body, exists, json, readJson, voiceReviewPath, wsDir } from "../core";

export async function voiceRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  // Align → Pauses: every section's words with the places a pause may go (from the last scan), for the picker
  if (rest === "/align/holdpoints" && req.method === "GET") {
    const d = wsDir(ws), audio = path.join(d, "03-voiceover/audio");
    const pts = readJson<any>(path.join(audio, "hold_points.json"));
    if (!pts) return json({ sections: [], at: null });
    const parts = exists(audio) ? fs.readdirSync(audio).filter((x) => /^part-\d+$/.test(x)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))) : [];
    const ids = parts.flatMap((p) => fs.readdirSync(path.join(audio, p)).filter((f) => f.endsWith(".wav")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => ({ id: f.replace(/\.wav$/, ""), part: parseInt(p.slice(5)) })));
    let off = 0;
    const sections = ids.map(({ id, part }) => {
      const w = readJson<any>(path.join(d, "04-transcription/words", `${id}.json`));
      const out = { id, part, startS: off, words: (w?.words ?? []).map((x: any) => x.word as string), points: pts.sections[id]?.points ?? [] };
      off += w?.duration ?? 0;
      return out;
    });
    return json({ at: pts.at, sections });
  }
  if (rest === "/align/holds" && req.method === "PUT") {
    const b = await body(req).catch(() => null);
    if (!b || !Array.isArray(b.holds)) return bad("{holds: [...]}");
    const out = [];
    for (const h of b.holds) {
      if (!h || typeof h.section !== "string" || !/^[\w-]+$/.test(h.section)) return bad("bad section");
      if (!(h.after === "end" || (Number.isInteger(h.after) && h.after >= 0))) return bad("bad position");
      const ms = Math.round(Number(h.ms));
      if (!(ms >= 50 && ms <= 4000)) return bad("a pause is 50–4000 ms");
      out.push({ id: /^[\w-]{1,40}$/.test(String(h.id)) ? String(h.id) : crypto.randomUUID().slice(0, 8), section: h.section, after: h.after, word: String(h.word ?? "").slice(0, 80), ...(h.next ? { next: String(h.next).slice(0, 80) } : {}),
        ms, on: h.on !== false, by: String(h.by ?? "you").slice(0, 40), ...(h.why ? { why: String(h.why).slice(0, 300) } : {}), ...(h.act ? { act: String(h.act).slice(0, 8) } : {}), ...(h.note ? { note: String(h.note).slice(0, 300) } : {}), ...(h.key ? { key: String(h.key).slice(0, 200) } : {}) });
    }
    fs.writeFileSync(path.join(wsDir(ws), "03-voiceover/holds.json"), JSON.stringify({ holds: out }, null, 2) + "\n");
    return json({ ok: true });
  }

  // Voice → Review: per section { note, direction?, status: open | regenerated, at }; generate.ts --review reads it
  if (rest === "/voice/review" && req.method === "PUT") {
    const b = await body(req).catch(() => null);
    if (!b || typeof b !== "object" || Array.isArray(b)) return bad("a JSON object of sections");
    const out: Record<string, any> = {};
    for (const [id, r] of Object.entries<any>(b)) {
      if (!/^[\w-]+$/.test(id) || !r || typeof r !== "object") return bad(`bad entry ${id}`);
      const note = String(r.note ?? "").slice(0, 2000), direction = String(r.direction ?? "").slice(0, 2000);
      out[id] = { note, ...(direction.trim() ? { direction } : {}), status: r.status === "regenerated" ? "regenerated" : "open", at: typeof r.at === "string" ? r.at : new Date().toISOString(), ...(r.regeneratedAt ? { regeneratedAt: String(r.regeneratedAt) } : {}) };
    }
    fs.writeFileSync(voiceReviewPath(ws), JSON.stringify(out, null, 2));
    return json({ ok: true });
  }

  return null;
}
