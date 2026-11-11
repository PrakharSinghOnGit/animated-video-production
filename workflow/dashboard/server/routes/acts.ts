/** Plan and acts: review notes per act, the plan approval, stopping a batch, approving an act. */
import fs from "node:fs";
import path from "node:path";
import { actIds, bad, exists, json, mtime, notesRel, wsDir } from "../core";
import { runningJobs } from "../jobs";
import { approvalPath, sceneFiles } from "../status";

export async function actsRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  // your verdict on one cut between acts (Render → Seams): fine / not fine + a note; null clears it. Kept with the seam's
  // version (its key), so a mark made before the acts changed shows as out of date. seams.ts --fix-marked reads it.
  if (rest === "/seams/mark" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const id = typeof b.seam === "string" ? b.seam.toUpperCase() : "";
    const dir = path.join(wsDir(ws), "05-video/review/seams");
    let report: any[] = [];
    try { report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf-8")).seams ?? []; } catch {}
    const seam = report.find((x) => `${x.a}-${x.b}` === id);
    if (!seam) return bad("unknown seam: run Seams first");
    const f = path.join(dir, "marks.json");
    let marks: Record<string, any> = {};
    try { marks = JSON.parse(fs.readFileSync(f, "utf-8")); } catch {}
    if (b.ok === null) delete marks[id];
    else {
      if (typeof b.ok !== "boolean") return bad("ok: true, false or null");
      const side = ["a", "b", "both"].includes(b.side) ? b.side : "both";
      marks[id] = { ok: b.ok, note: typeof b.note === "string" ? b.note.replace(/\s+/g, " ").trim().slice(0, 1500) : "", side, at: new Date().toISOString(), key: seam.key };
    }
    fs.writeFileSync(f, JSON.stringify(marks, null, 2));
    return json({ ok: true });
  }

  const nm = rest.match(/^\/notes\/(A\d{2,3})$/);
  if (nm && req.method === "PUT") {
    if (!actIds(ws).includes(nm[1])) return bad("unknown act");
    const text = await req.text();
    if (text.length > 200_000) return bad("notes too large");
    const f = path.join(wsDir(ws), notesRel(nm[1]));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text, "utf-8");
    return json({ ok: true });
  }

  // your approval of the plan as it is (also when it is out of sync with the captions or failed validation):
  // the act author then starts without the freshness check (05-video/src/lib/freshness.ts)
  if (rest === "/plan/approve" && (req.method === "POST" || req.method === "DELETE")) {
    const f = path.join(wsDir(ws), "05-video/plan_approved.json");
    if (req.method === "DELETE") { fs.rmSync(f, { force: true }); return json({ ok: true }); }
    const plan = path.join(wsDir(ws), "05-video/acts.json");
    if (!exists(plan)) return bad("no plan yet");
    fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), sha256: new Bun.CryptoHasher("sha256").update(fs.readFileSync(plan)).digest("hex") }, null, 2));
    return json({ ok: true });
  }

  // let the running acts of a batch finish, start no new ones (author_act.ts checks this file)
  if (rest === "/acts/stop-batch" && req.method === "POST") {
    if (!runningJobs(ws).some((j) => j.step === "acts")) return bad("no batch is running", 404);
    fs.writeFileSync(path.join(wsDir(ws), "05-video/.batch_stop"), new Date().toISOString());
    return json({ ok: true });
  }

  const am = rest.match(/^\/approve\/(A\d{2,3})$/);
  if (am && (req.method === "POST" || req.method === "DELETE")) {
    if (!actIds(ws).includes(am[1])) return bad("unknown act");
    const f = approvalPath(ws, am[1]);
    if (req.method === "DELETE") { fs.rmSync(f, { force: true }); return json({ ok: true }); }
    const sc = sceneFiles(ws)[am[1]];
    if (!sc) return bad("act has no scene file yet");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), sceneMtime: mtime(path.join(wsDir(ws), sc)) }));
    return json({ ok: true });
  }

  return null;
}
