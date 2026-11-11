/** One project: its status, rename, running and stopping jobs, logs, the studio, the overview, downloads, foley edits and files. */
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "../../envfile";
import { nameSource } from "../../../lib/rename";
import * as sh from "../../../08-shorts/lib";
import { bad, body, exists, fileInfo, json, mtime, readJson, wsDir } from "../core";
import { clashWith, jobSummary, killTree, lastLogBlock, runningJob, runningJobs, startJob } from "../jobs";
import { currentStudio, startStudio, studioState } from "../studio";
import { autoName, doRename, renameBlocker } from "../naming";
import { commandFor } from "../actions";
import { details } from "../details";
import { deliverInfo, dirBytes, safePath, serveFile, shortParam, subWs, validSfxEdits } from "../files";

export async function projectRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  if (rest === "/status" && req.method === "GET") return json(details(ws));

  // rename: {name} sets it, no name asks the naming model (as for an untitled project)
  if (rest === "/rename" && req.method === "POST") {
    const b = await body(req);
    const busy = renameBlocker(ws);
    if (busy) return bad(busy, 409);
    if (typeof b.name === "string" && b.name.trim()) {
      try { return json({ ok: true, id: doRename(ws, b.name) }); } catch (e) { return bad((e as Error).message); }
    }
    if (!nameSource(ws)) return bad("nothing to name it from yet: write the idea or the script first");
    const r = await autoName(ws, true);
    return r.id ? json({ ok: true, id: r.id }) : bad(r.error ?? "naming failed");
  }

  if (rest === "/log" && req.method === "GET") {
    const step = url.searchParams.get("step") ?? "";
    return new Response(lastLogBlock(ws, step), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  if (rest === "/run" && req.method === "POST") {
    const { action, act, opts, dry } = await body(req);
    if (typeof action !== "string") return bad("action required");
    if (dry === true) {   // validate and show the commands without running them
      const c = commandFor(ws, action, opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {}, typeof act === "string" ? act.toUpperCase() : undefined);
      return typeof c === "string" ? bad(c) : json({ label: c.label, cmds: c.cmds });
    }
    const o = opts && typeof opts === "object" && !Array.isArray(opts) ? opts : {};
    const c = commandFor(ws, action, o, typeof act === "string" ? act.toUpperCase() : undefined);
    if (typeof c === "string") return bad(c);
    // jobs on different acts run side by side; anything that touches the same act, or the whole video, waits
    const busy = clashWith(ws, c.locks);
    if (busy) return bad(`busy: ${busy.label} is running${busy.locks.includes("*") ? "" : ` (it uses ${busy.locks.filter((l) => c.locks.includes(l) || c.locks.includes("*")).map((l) => l.replace("act:", "")).join(", ")})`}`, 409);
    return json({ job: jobSummary(startJob(ws, c.key, c.label, c.cmds, o, c.locks)) });
  }

  if (rest === "/stop" && req.method === "POST") {
    const { job: jid } = await body(req).catch(() => ({}));
    const j = typeof jid === "string" ? runningJobs(ws).find((x) => x.id === jid) : runningJob(ws);
    if (!j) return bad("nothing running", 404);
    j.stopRequested = true;
    if (j.pid) killTree(j.pid);
    setTimeout(() => { if (j.status === "running" && j.pid) killTree(j.pid, "SIGKILL"); }, 5000);
    return json({ ok: true });
  }

  if (rest === "/studio" && req.method === "POST") {
    const studio = currentStudio();
    if (studio && studio.exited === null) return bad(studio.ws === ws ? "studio already running" : `studio is running for ${studio.ws}; stop it first`, 409);
    if (!exists(path.join(wsDir(ws), "05-video/src/index.ts"))) return bad("no 05-video/src/index.ts yet (run an act or assemble first)");
    return json({ studio: (startStudio(ws), studioState()) });
  }

  if (rest === "/overview" && req.method === "GET") {
    const ids = sh.listShorts(ws);
    const [total, ...per] = await Promise.all([dirBytes(wsDir(ws)), ...ids.map((id) => dirBytes(sh.shortWs(ws, id)))]);
    return json({
      bytes: { total, shorts: Object.fromEntries(ids.map((id, i) => [id, per[i]])) },
      deliver: { video: deliverInfo(wsDir(ws)), shorts: Object.fromEntries(ids.map((id) => [id, deliverInfo(sh.shortWs(ws, id))])) },
    });
  }

  // a file as a download (attachment); same path rules as /file
  if (rest === "/download" && req.method === "GET") {
    const abs = safePath(ws, url.searchParams.get("path"));
    if (!abs) return bad("path rejected", 403);
    if (!fs.statSync(abs).isFile()) return bad("not a file", 404);
    const res = serveFile(req, abs), name = path.basename(abs);
    res.headers.set("content-disposition", `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    return res;
  }

  // foley review: every event the acts declare, the user's edits and the playable clips
  if (rest === "/sfx" && (req.method === "GET" || req.method === "PUT")) {
    const sid = shortParam(ws, url);
    if (sid instanceof Response) return sid;
    const dir = subWs(ws, sid), editsF = path.join(dir, "05-video/sfx_edits.json");
    if (req.method === "GET") {
      const edits = readJson<any>(editsF) ?? {};
      const events = readJson<any[]>(path.join(dir, "05-video/events_all.json"));
      const clips = readJson<any[]>(path.join(dir, "06-audio/sfx_clips/manifest.json"));
      const have = new Set((clips ?? []).map((c) => c?.key));
      return json({
        events: Array.isArray(events) ? events : null, eventsAt: mtime(path.join(dir, "05-video/events_all.json")),
        edits: { off: Array.isArray(edits.off) ? edits.off : [], gainDb: edits.gainDb && typeof edits.gainDb === "object" ? edits.gainDb : {} },
        clips: Array.isArray(clips) ? clips : null, clipsMissing: Array.isArray(events) && Array.isArray(clips) ? events.filter((e) => !have.has(e.key)).length : null,
        draft: fileInfo(ws, sid ? `shorts/${sid}/05-video/draft.mp4` : "05-video/draft.mp4"),
      });
    }
    const v = validSfxEdits(await body(req));
    if (typeof v === "string") return bad(v);
    fs.mkdirSync(path.dirname(editsF), { recursive: true });
    atomicWrite(editsF, JSON.stringify(v, null, 1));
    return json({ ok: true, edits: v });
  }

  if (rest === "/file" && (req.method === "GET" || req.method === "HEAD")) {
    const abs = safePath(ws, url.searchParams.get("path"));
    if (!abs) return bad("path rejected", 403);
    if (!fs.statSync(abs).isFile()) return bad("not a file", 404);
    return serveFile(req, abs);
  }

  return null;
}
