/** Accepting a check error: the creator overrides a check that is wrong in this case (workflow/lib/accepted.ts).
 *  POST /api/ws/<ws>/accept {scope, text, short?, undo?}: short = "S1" for a short's script checks (scope "script"). */
import * as sh from "../../../08-shorts/lib";
import { ACCEPT_SCOPE, setAccepted } from "../../../lib/accepted";
import { bad, body, json, wsDir } from "../core";

export async function acceptRoutes(req: Request, _url: URL, ws: string, rest: string): Promise<Response | null> {
  if (rest !== "/accept" || req.method !== "POST") return null;
  const b = await body(req);
  if (typeof b.scope !== "string" || !ACCEPT_SCOPE.test(b.scope)) return bad("scope: script, meta or thumb:A|B|C");
  if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 4000) return bad("text: the error, up to 4000 characters");
  let dir = wsDir(ws);
  if (b.scope === "script") {
    if (typeof b.short !== "string" || !sh.listShorts(ws).includes(b.short)) return bad("unknown short");
    dir = sh.shortWs(ws, b.short);
  }
  setAccepted(dir, b.scope, b.text, !b.undo);
  return json({ ok: true });
}
