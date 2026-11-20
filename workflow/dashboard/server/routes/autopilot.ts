/**
 * Autopilot for one video (server/autopilot.ts): switch it on with a mode per step and the options saved on each
 * step's card, change the modes while it runs, give Continue at a step you review, or switch it off.
 */
import { bad, body, json } from "../core";
import { continueAutopilot, readAutopilot, startAutopilot, stopAutopilot, updateAutopilot } from "../autopilot";

export async function autopilotRoutes(req: Request, _url: URL, ws: string, rest: string): Promise<Response | null> {
  if (rest !== "/autopilot") return null;
  if (req.method === "GET") return json(readAutopilot(ws));
  if (req.method === "POST") {
    const b = await body(req);
    const opts = b.opts && typeof b.opts === "object" ? b.opts : undefined;
    if (typeof b.continue === "string") { const r = continueAutopilot(ws, b.continue); return typeof r === "string" ? bad(r, 409) : json(r); }
    if (b.on === false) return json(stopAutopilot(ws));
    if (b.on !== true) return bad("on: true or false, or continue: <step>");
    if (readAutopilot(ws)?.on) return b.update === true ? json(updateAutopilot(ws, { modes: b.modes, opts })) : bad("autopilot is already on", 409);
    return json(startAutopilot(ws, { modes: b.modes, opts }));
  }
  return null;
}
