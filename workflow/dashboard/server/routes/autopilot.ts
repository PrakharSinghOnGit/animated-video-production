/** Autopilot for one video (server/autopilot.ts): switch it on with the options saved on each step's card, or off. */
import { bad, body, json } from "../core";
import { readAutopilot, startAutopilot, stopAutopilot } from "../autopilot";

export async function autopilotRoutes(req: Request, _url: URL, ws: string, rest: string): Promise<Response | null> {
  if (rest !== "/autopilot") return null;
  if (req.method === "GET") return json(readAutopilot(ws));
  if (req.method === "POST") {
    const b = await body(req);
    if (b.on === false) return json(stopAutopilot(ws));
    if (b.on !== true) return bad("on: true or false");
    if (readAutopilot(ws)?.on) return bad("autopilot is already on", 409);
    return json(startAutopilot(ws, { until: b.until, planGate: b.planGate === true, opts: b.opts && typeof b.opts === "object" ? b.opts : {} }));
  }
  return null;
}
