/** The creator's text files: the draft, the research, feedback on the last script, and the script itself. */
import fs from "node:fs";
import path from "node:path";
import { bad, exists, fileInfo, json, wsDir } from "../core";
import { runningJob } from "../jobs";

export async function scriptRoutes(req: Request, url: URL, ws: string, rest: string): Promise<Response | null> {
  // the creator's text files: draft, feedback on the last script, the script itself
  const tm = rest.match(/^\/text\/(idea|feedback|research)$/);
  if (tm && req.method === "PUT") {
    const text = await req.text();
    if (text.length > 1_000_000) return bad("too large");
    const f = path.join(wsDir(ws), `02-scripting/${tm[1]}.md`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text, "utf-8");
    return json({ ok: true });
  }

  if (rest === "/script") {
    const f = path.join(wsDir(ws), "02-scripting/script_raw.md");
    if (req.method === "GET") return new Response(exists(f) ? Bun.file(f) : "", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > 1_000_000) return bad("script too large");
      if (runningJob(ws)?.step === "script") return bad("format is running", 409);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (exists(f)) fs.copyFileSync(f, f.replace(/\.md$/, ".prev.md"));
      fs.writeFileSync(f, text, "utf-8");
      return json({ ok: true, file: fileInfo(ws, "02-scripting/script_raw.md") });
    }
  }

  return null;
}
