/** Packaging: notes per thumbnail variant, edits to titles / description / tags, and the approval of the packages. */
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "../../envfile";
import * as pub from "../../../07-publish/lib";
import { bad, body, exists, json, readJson } from "../core";
import { runningJob } from "../jobs";
import { PUB_FILES, approvalFile, publishHash } from "../status";

export async function publishRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  const pnm = rest.match(/^\/publish\/notes\/([ABC]|meta)$/);
  if (pnm && req.method === "PUT") {
    const text = await req.text();
    if (text.length > 100_000) return bad("notes too large");
    const f = pub.pubFile(ws, `notes/${pnm[1]}.md`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text, "utf-8");
    return json({ ok: true });
  }

  // titles / description / tags edited in the dashboard: saved to metadata.json (and description.txt), checks re-run
  if (rest === "/publish/metadata" && req.method === "PUT") {
    const meta = readJson<any>(pub.pubFile(ws, "metadata.json"));
    if (!meta) return bad("no metadata yet: run Titles & description first");
    if (runningJob(ws)?.step === "publish") return bad("a publish job is running", 409);
    const before = JSON.stringify([meta.titles, meta.description, meta.tags, meta.hashtags]);
    const b = await body(req);
    if (b.titles && typeof b.titles === "object") for (const v of pub.VARIANTS) if (b.titles[v] !== undefined) {
      if (typeof b.titles[v] !== "string" || b.titles[v].length > 300) return bad(`title ${v}: text up to 300 characters`);
      meta.titles[v].title = b.titles[v].trim();
    }
    if (b.description !== undefined) { if (typeof b.description !== "string" || b.description.length > 20000) return bad("description: text up to 20000 characters"); meta.description = b.description.replace(/\r\n/g, "\n"); }
    if (b.tags !== undefined) { if (!Array.isArray(b.tags) || b.tags.some((t: unknown) => typeof t !== "string")) return bad("tags: a list of text"); meta.tags = b.tags.map((t: string) => t.trim()).filter(Boolean); }
    if (b.hashtags !== undefined) { if (!Array.isArray(b.hashtags) || b.hashtags.some((t: unknown) => typeof t !== "string")) return bad("hashtags: a list of text"); meta.hashtags = b.hashtags.map((t: string) => t.trim()).filter(Boolean); }
    if (JSON.stringify([meta.titles, meta.description, meta.tags, meta.hashtags]) !== before) meta.edited = true;
    meta.checks = pub.recheck(ws, meta);
    atomicWrite(pub.pubFile(ws, "metadata.json"), JSON.stringify(meta, null, 2));
    atomicWrite(pub.pubFile(ws, "description.txt"), meta.description);
    return json({ ok: true, checks: meta.checks });
  }

  if (rest === "/publish/approve" && (req.method === "POST" || req.method === "DELETE")) {
    if (req.method === "DELETE") { fs.rmSync(approvalFile(ws), { force: true }); return json({ ok: true }); }
    if (!exists(pub.pubFile(ws, "metadata.json")) || PUB_FILES(ws).some((p) => !p)) return bad("needs the metadata and all three thumbnails first");
    fs.writeFileSync(approvalFile(ws), JSON.stringify({ at: new Date().toISOString(), hash: publishHash(ws) }));
    return json({ ok: true });
  }

  return null;
}
