/** Settings routes: models per agent step, the .env editor, notifications, the editable prompt and style files. */
import fs from "node:fs";
import path from "node:path";
import { catalog, parseSpec, readDefaults, writeDefault, PROVIDERS, ROLES } from "../../../lib/models";
import { atomicWrite, removeEnv, serializeEnv, setEnv, KEY_RE } from "../../envfile";
import { ENV_FILE, REPO, bad, body, exists, json, mtime } from "../core";
import { notify, notifyCfg } from "../notify";
import { envView, readEnvLines, settingsFiles, settingsPath } from "../settings";

export async function settingsRoutes(req: Request, url: URL): Promise<Response | null> {
  const p = url.pathname;
  // Settings → Models: which model runs each agent step (workflow/models.json) and every model found on this machine
  if (p === "/api/models" && (req.method === "GET" || req.method === "POST")) {
    const cat = catalog(req.method === "POST");
    const d = readDefaults();
    return json({
      roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label, group: r.group, edits: r.edits, builtin: r.def, current: parseSpec(d[key] ?? r.def).spec, custom: key in d })),
      providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { ...v, ...cat[k as keyof typeof cat] }])),
    });
  }
  if (p === "/api/models" && req.method === "PUT") {
    const b = await body(req);
    try { writeDefault(String(b.role ?? ""), b.spec ? String(b.spec) : null); } catch (e) { return bad((e as Error).message); }
    return json({ ok: true });
  }

  if (p === "/api/settings/env") {
    if (req.method === "GET") {
      const reveal = url.searchParams.get("reveal");
      if (reveal) {
        if (!KEY_RE.test(reveal)) return bad("bad key");
        return json({ value: readEnvLines().find((l) => l.key === reveal)?.value ?? "" });
      }
      return json({ file: path.basename(ENV_FILE), exists: exists(ENV_FILE), ...envView() });
    }
    if (req.method === "PUT") {
      const b = await body(req);
      let lines = readEnvLines();
      try {
        for (const [k, v] of Object.entries(b.set && typeof b.set === "object" ? b.set : {})) { if (typeof v !== "string") return bad(`${k}: value must be text`); lines = setEnv(lines, k, v); }
        for (const k of Array.isArray(b.remove) ? b.remove : []) { if (!KEY_RE.test(String(k))) return bad("bad key"); lines = removeEnv(lines, String(k)); }
      } catch (e: any) { return bad(e.message); }
      atomicWrite(ENV_FILE, serializeEnv(lines));
      return json({ ok: true, ...envView() });
    }
  }

  if (p === "/api/settings/notify" && req.method === "GET") { const { topic, ...c } = notifyCfg(); return json({ ...c, topicSet: !!topic }); }
  if (p === "/api/settings/notify/test" && req.method === "POST") {
    const b = await body(req);
    const only = b.only === "mac" || b.only === "phone" ? b.only : undefined;
    notify("WealthGap dashboard", "Test notification: this channel works.", true, "bell", only);
    const { topic, ...c } = notifyCfg();
    return json({ ok: true, sent: { mac: c.mac && only !== "phone", phone: c.phone && only !== "mac" } });
  }
  if (p === "/api/settings/files" && req.method === "GET") return json({ files: settingsFiles().map((f) => ({ path: f, mtime: mtime(path.join(REPO, f)) })) });
  if (p === "/api/settings/file") {
    const abs = settingsPath(url.searchParams.get("path"));
    if (!abs) return bad("path not allowed", 403);
    if (req.method === "GET") return new Response(exists(abs) ? Bun.file(abs) : "", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    if (req.method === "PUT") {
      const text = await req.text();
      if (text.length > 500_000) return bad("file too large");
      if (exists(abs)) fs.copyFileSync(abs, `${abs}.prev`);   // one-step undo; the name does not match the allowlist
      atomicWrite(abs, text);
      return json({ ok: true, mtime: mtime(abs) });
    }
  }

  return null;
}
