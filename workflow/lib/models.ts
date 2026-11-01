/**
 * Which model runs each agent step. A model is "<provider>:<model>":
 *   claude:opus, claude-iit:sonnet (CLAUDE_CONFIG_DIR=~/.claude-iit), codex:gpt-6-luna, opencode:opencode/glm-5.3-flash-free,
 *   ollama:gemma3 (local, run through opencode so it can use tools), agy:gemini-3.8-flash-medium (read-only).
 * Bare "opus" / "sonnet" / "haiku" mean the default Claude profile; bare "agy" is agy's default model.
 *
 * Defaults per step live in workflow/models.json (Settings → Agent models in the dashboard); a step's --model flag
 * overrides for one run. Legacy env vars (e.g. WRITER_MODEL) apply only when models.json has no entry.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const REPO = path.resolve(import.meta.dir, "../..");
const MODELS_FILE = path.join(REPO, "workflow/models.json");
const CACHE_FILE = path.join(REPO, "workspace/.models_cache.json");

export type Provider = "claude" | "claude-iit" | "codex" | "opencode" | "ollama" | "agy";
export interface ProviderInfo { label: string; billing: "subscription" | "free" | "local"; edits: boolean; note: string }
export const PROVIDERS: Record<Provider, ProviderInfo> = {
  claude: { label: "Claude", billing: "subscription", edits: true, note: "Claude Code, default profile (~/.claude)" },
  "claude-iit": { label: "Claude IIT", billing: "subscription", edits: true, note: "Claude Code, profile ~/.claude-iit" },
  codex: { label: "Codex", billing: "subscription", edits: true, note: "codex exec, workspace-write sandbox (no per-tool allow list)" },
  opencode: { label: "OpenCode", billing: "free", edits: true, note: "opencode run --auto (no per-tool allow list); some models are free" },
  ollama: { label: "Ollama", billing: "local", edits: true, note: "local model through opencode; needs a model with tool calling to edit files" },
  agy: { label: "agy", billing: "free", edits: false, note: "Antigravity CLI in plan mode: read-only, review steps only" },
};
export const CLAUDE_DIRS: Record<"claude" | "claude-iit", string> = {
  claude: path.join(os.homedir(), ".claude"),
  "claude-iit": path.join(os.homedir(), ".claude-iit"),
};

/** Agent steps. `edits`: the step writes files (agy cannot run it). */
export interface Role { label: string; def: string; env?: string; edits: boolean; group: string }
export const ROLES: Record<string, Role> = {
  writer: { label: "Script writer", def: "claude:opus", env: "WRITER_MODEL", edits: true, group: "Script" },
  director: { label: "Director (act plan)", def: "claude:opus", env: "DIRECTOR_MODEL", edits: true, group: "Video" },
  actAuthor: { label: "Act author", def: "claude:opus", env: "ACT_MODEL", edits: true, group: "Video" },
  critic: { label: "Act critic", def: "agy:gemini-3.8-flash-medium", env: "CRITIC_MODEL", edits: false, group: "Video" },
  actReview: { label: "Sync review", def: "agy:gemini-3.8-flash-medium", edits: false, group: "Video" },
  meta: { label: "Titles & description", def: "claude:sonnet", edits: false, group: "Publish" },
  thumbs: { label: "Thumbnail designer", def: "claude:sonnet", edits: true, group: "Publish" },
  thumbsReview: { label: "Thumbnail review", def: "claude:haiku", edits: false, group: "Publish" },
  shortsWriter: { label: "Shorts writer", def: "claude:opus", env: "SHORTS_MODEL", edits: true, group: "Shorts" },
  shortsDirector: { label: "Shorts director", def: "claude:sonnet", edits: true, group: "Shorts" },
  shortsAct: { label: "Shorts act author", def: "claude:opus", edits: true, group: "Shorts" },
  analytics: { label: "Analytics reviewer", def: "claude:sonnet", edits: false, group: "Analytics" },
};
export type RoleKey = keyof typeof ROLES;

export interface Spec { provider: Provider; model: string; spec: string }

/** "opus" -> claude:opus, "agy" -> agy:<default>, "codex:gpt-6-luna" -> codex / gpt-6-luna. Throws on an unknown provider. */
export function parseSpec(spec: string): Spec {
  const s = spec.trim();
  if (/^(opus|sonnet|haiku|fable)$/i.test(s)) return { provider: "claude", model: s.toLowerCase(), spec: `claude:${s.toLowerCase()}` };
  if (s === "agy") { const model = process.env.AGY_MODEL ?? "gemini-3.8-flash-medium"; return { provider: "agy", model, spec: `agy:${model}` }; }
  const i = s.indexOf(":");
  const provider = (i < 0 ? s : s.slice(0, i)) as Provider;
  if (!(provider in PROVIDERS)) throw new Error(`unknown model '${spec}' (use provider:model with provider one of ${Object.keys(PROVIDERS).join(", ")})`);
  const model = i < 0 ? "" : s.slice(i + 1);
  if (!model) throw new Error(`'${spec}': missing the model after "${provider}:"`);
  return { provider, model, spec: s };
}

/** Safe in file names: "opencode:opencode/glm" -> "opencode_opencode_glm". */
export const specSlug = (spec: string) => spec.replace(/[^\w.-]+/g, "_");
export const isAgy = (spec: string) => parseSpec(spec).provider === "agy";
export const agyModel = (spec: string) => parseSpec(spec).model;

export function readDefaults(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(MODELS_FILE, "utf-8")); } catch { return {}; }
}
export function writeDefault(role: string, spec: string | null) {
  if (!(role in ROLES)) throw new Error(`unknown step '${role}'`);
  const cur = readDefaults();
  if (spec) {
    const p = parseSpec(spec);
    if (ROLES[role].edits && !PROVIDERS[p.provider].edits) throw new Error(`${ROLES[role].label} writes files; ${PROVIDERS[p.provider].label} is read-only`);
    cur[role] = p.spec;
  } else delete cur[role];
  fs.writeFileSync(MODELS_FILE, JSON.stringify(cur, null, 2) + "\n");
}

/** The model for a step: --model flag, else workflow/models.json (Settings), else its legacy env var, else the built-in default. */
export function roleModel(role: RoleKey, flag?: string | null): string {
  const r = ROLES[role];
  const v = flag || readDefaults()[role] || (r.env ? process.env[r.env] : undefined) || r.def;
  parseSpec(v);
  return v;
}

// ───────────── discovery (cached 10 min in workspace/.models_cache.json) ─────────────

export interface ModelEntry { id: string; label: string; free?: boolean; tools?: boolean }
export type Catalog = Record<Provider, { ok: boolean; error?: string; models: ModelEntry[] }>;

const run = (cmd: string, args: string[], timeout = 20000) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8", timeout, env: process.env });
  return r.status === 0 ? (r.stdout ?? "") : null;
};
const has = (cmd: string) => spawnSync("which", [cmd], { encoding: "utf-8" }).status === 0;

function claudeModels(): ModelEntry[] {
  return [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }, { id: "haiku", label: "Haiku" }];
}

function codexModels(): ModelEntry[] {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".codex/models_cache.json"), "utf-8"));
    return (d.models ?? []).filter((m: any) => m.visibility === "list").sort((a: any, b: any) => (a.priority ?? 99) - (b.priority ?? 99)).map((m: any) => ({ id: m.slug, label: m.display_name ?? m.slug }));
  } catch { return []; }
}

function opencodeModels(): ModelEntry[] {
  const out = run("opencode", ["models"], 30000);
  if (!out) return [];
  return out.split("\n").map((l) => l.trim()).filter((l) => /^[\w.-]+\/[\w.:@-]+$/.test(l))
    // claude-agent/* goes through Claude Code itself: pick the claude provider for those
    .filter((l) => !l.startsWith("claude-agent/") && !l.startsWith("ollama/"))
    .map((id) => ({ id, label: id, free: /free|big-pickle/.test(id) }));
}

function agyModels(): ModelEntry[] {
  const out = run("agy", ["models"], 30000);
  if (!out) return [];
  return out.split("\n").map((l) => l.split("\t")).filter((c) => c.length >= 2 && /^[\w.-]+$/.test(c[0])).map(([id, label]) => ({ id, label: label.trim(), free: true }));
}

/** Locally pulled Ollama models (from the manifests on disk, so the server need not be running). */
export function ollamaModels(): ModelEntry[] {
  const lib = path.join(os.homedir(), ".ollama/models/manifests/registry.ollama.ai");
  const out: ModelEntry[] = [];
  const walk = (dir: string, parts: string[]) => {
    let ents: fs.Dirent[] = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) walk(path.join(dir, e.name), [...parts, e.name]);
      else {
        const [ns, ...name] = parts;
        const repo = ns === "library" ? name.join("/") : [ns, ...name].join("/");
        out.push({ id: e.name === "latest" ? repo : `${repo}:${e.name}`, label: `${repo}:${e.name}`, free: true });
      }
    }
  };
  walk(lib, []);
  // tool calling decides whether the model can run a step at all (every step reads files); ask the server when it is up
  for (const m of out) {
    const r = spawnSync("curl", ["-s", "-m", "3", "http://127.0.0.1:11434/api/show", "-d", JSON.stringify({ model: m.id })], { encoding: "utf-8" });
    try { const caps: string[] = JSON.parse(r.stdout).capabilities ?? []; m.tools = caps.includes("tools"); } catch {}
  }
  return out;
}

export function catalog(force = false): Catalog {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    if (!force && Date.now() - c.at < 10 * 60_000) return c.catalog;
  } catch {}
  const entry = (cmd: string | null, list: () => ModelEntry[]) => {
    if (cmd && !has(cmd)) return { ok: false, error: `${cmd} is not installed`, models: [] };
    try { const models = list(); return { ok: models.length > 0, error: models.length ? undefined : "no models found", models }; }
    catch (e) { return { ok: false, error: (e as Error).message, models: [] }; }
  };
  const claudeIit = fs.existsSync(CLAUDE_DIRS["claude-iit"]);
  const c: Catalog = {
    claude: entry("claude", claudeModels),
    "claude-iit": claudeIit ? entry("claude", claudeModels) : { ok: false, error: "~/.claude-iit not found", models: [] },
    codex: entry("codex", codexModels),
    opencode: entry("opencode", opencodeModels),
    ollama: entry("ollama", ollamaModels),
    agy: entry("agy", agyModels),
  };
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ at: Date.now(), catalog: c }));
  return c;
}

/** Every model as a spec string, grouped by provider, for selects. */
/** Every model that can run a step, as a spec string, grouped by provider (Ollama models without tool calling are left out). */
export function allSpecs(c = catalog()): string[] {
  return (Object.keys(c) as Provider[]).flatMap((p) => c[p].models.filter((m) => m.tools !== false).map((m) => `${p}:${m.id}`));
}

// CLI: bun run models [--refresh] | bun run models --set <step> <provider:model> | --reset <step>
if (import.meta.main) {
  const a = process.argv.slice(2);
  if (a[0] === "--set") { writeDefault(a[1], a[2]); console.log(`${a[1]} -> ${a[2]}`); }
  else if (a[0] === "--reset") { writeDefault(a[1], null); console.log(`${a[1]} -> default (${ROLES[a[1]].def})`); }
  const cat = catalog(a.includes("--refresh"));
  const d = readDefaults();
  console.log("\nSteps:");
  for (const [k, r] of Object.entries(ROLES)) console.log(`  ${k.padEnd(15)} ${r.label.padEnd(22)} ${(d[k] ?? r.def).padEnd(36)}${d[k] ? "" : "(built-in default)"}`);
  console.log("\nModels:");
  for (const [p, e] of Object.entries(cat)) console.log(`  ${p.padEnd(11)} ${e.ok ? e.models.map((m) => m.id).join(", ") : `— ${e.error}`}`);
}
