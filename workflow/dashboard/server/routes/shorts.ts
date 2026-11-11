/** Shorts: the allowlisted text files (a short's script, feedback, director notes; the folder's feedback). */
import fs from "node:fs";
import path from "node:path";
import * as sh from "../../../08-shorts/lib";
import { bad, exists, json } from "../core";
import { runningJob } from "../jobs";
import { SHORT_NOTES } from "../details";

export async function shortsRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  // shorts: allowlisted text files only (a short's script, feedback, director notes; the folder's feedback)
  const ssm = rest.match(/^\/shorts\/(?:(S\d{1,2})\/(script|feedback|notes)|(feedback))$/);
  if (ssm && req.method === "PUT") {
    const sid = ssm[1];
    if (sid && !sh.listShorts(ws).includes(sid)) return bad("unknown short");
    const text = await req.text();
    if (text.length > 1_000_000) return bad("too large");
    const rel = sid ? { script: "02-scripting/script_raw.md", feedback: "02-scripting/feedback.md", notes: SHORT_NOTES }[ssm[2] as "script" | "feedback" | "notes"] : null;
    const f = sid ? path.join(sh.shortWs(ws, sid), rel!) : path.join(sh.shortsDir(ws), "feedback.md");
    if (sid && ssm[2] === "script" && runningJob(ws)?.step === "shorts") return bad("a shorts job is running", 409);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (sid && ssm[2] === "script" && exists(f)) fs.copyFileSync(f, f.replace(/\.md$/, ".prev.md"));
    fs.writeFileSync(f, text, "utf-8");
    return json({ ok: true });
  }

  return null;
}
