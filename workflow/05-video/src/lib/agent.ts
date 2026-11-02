/**
 * Headless agent runs for the agent stages (writer, director, act author, critic, packaging, reviewers).
 * `model` is a spec from workflow/lib/models.ts: claude / claude-iit (Claude Code, tools pre-approved via
 * --allowedTools), codex (codex exec, workspace-write sandbox), opencode (opencode run --auto), ollama (a local
 * model through opencode) or agy (read-only). The prompt goes over stdin, the full output is logged, and cost,
 * tokens and wall time come back in one shape so every stage can be accounted for.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseSpec, ollamaModels, CLAUDE_DIRS, REPO, type Spec } from "../../../lib/models";

export interface AgentResult {
  ok: boolean;
  text: string;
  durationMs: number;
  costUsd: number;
  numTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  logPath: string;
  sessionId: string;
}

export interface AgentOptions {
  prompt: string;
  model: string;
  tools: string[];
  logPath: string;
  cwd?: string;
  maxTurns?: number;
  /** Continue an earlier run's session (its context is reused, so files need not be re-read). */
  resume?: string;
  /** Prompt for a fresh run when `resume` can't be used (the session belongs to another profile or provider, or is
   *  gone): the run starts over with this instead of failing. Without it, a missing session fails the run. */
  fresh?: string;
}

/** Whether a Claude profile has this session on disk (sessions are per config dir: a claude-iit session can't be
 *  resumed as claude). Other providers are checked by trying. */
function claudeHasSession(provider: "claude" | "claude-iit", id: string): boolean {
  const root = path.join(CLAUDE_DIRS[provider], "projects");
  try { return fs.readdirSync(root).some((d) => fs.existsSync(path.join(root, d, `${id}.jsonl`))); } catch { return false; }
}
const sessionMissing = (r: AgentResult) => {
  try { return /No conversation found|session .*not found|no (such )?session|unknown session|thread .*not found/i.test(fs.readFileSync(r.logPath, "utf-8")); } catch { return false; }
};

function cliArgs(opts: AgentOptions, model: string): string[] {
  const args = ["-p", "--model", model, "--output-format", "json", "--permission-mode", "acceptEdits"];
  if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));
  if (opts.resume) args.push("--resume", opts.resume);
  args.push("--allowedTools", ...opts.tools);
  return args;
}

function finish(opts: AgentOptions, status: number | null, stdout: string, stderr: string, errMsg: string, durationMs: number): AgentResult {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true });
  fs.writeFileSync(opts.logPath, `model: ${opts.model}\nexit: ${status}\nerror: ${errMsg}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`, "utf-8");

  let parsed: any = {};
  try {
    parsed = JSON.parse(stdout || "{}");
  } catch {
    parsed = { is_error: true };
  }
  const usage = parsed.usage ?? {};
  return {
    ok: status === 0 && !parsed.is_error,
    text: typeof parsed.result === "string" ? parsed.result : "",
    durationMs,
    costUsd: Number(parsed.total_cost_usd ?? 0),
    numTurns: Number(parsed.num_turns ?? 0),
    inputTokens: Number(usage.input_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0),
    logPath: opts.logPath,
    sessionId: typeof parsed.session_id === "string" ? parsed.session_id : "",
  };
}

/** One CLI invocation per provider: command, args, env, stdin, and how to read its stdout into an AgentResult. */
interface Plan { cmd: string; args: string[]; env?: Record<string, string>; stdin: string; parse: (opts: AgentOptions, status: number | null, stdout: string, stderr: string, err: string, ms: number) => AgentResult }

const logRun = (opts: AgentOptions, status: number | null, stdout: string, stderr: string, err: string) => {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true });
  fs.writeFileSync(opts.logPath, `model: ${opts.model}\nexit: ${status}\nerror: ${err}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`, "utf-8");
};
const jsonLines = (s: string) => s.split("\n").flatMap((l) => { try { return l.trim().startsWith("{") ? [JSON.parse(l)] : []; } catch { return []; } });

function plan(opts: AgentOptions, sp: Spec): Plan {
  if (sp.provider === "claude" || sp.provider === "claude-iit") {
    return {
      cmd: "claude", args: cliArgs(opts, sp.model), stdin: opts.prompt,
      env: sp.provider === "claude-iit" ? { CLAUDE_CONFIG_DIR: CLAUDE_DIRS["claude-iit"] } : undefined,
      parse: (o, st, out, err, e, ms) => finish(o, st, out, err, e, ms),
    };
  }
  if (sp.provider === "codex") {
    const last = path.join(os.tmpdir(), `wg_codex_${process.pid}_${Date.now()}.txt`);
    // `exec resume` has no -s/-C flags: the sandbox goes in as a config override (the session keeps its directory)
    const common = ["--json", "--skip-git-repo-check", "-c", 'sandbox_mode="workspace-write"', "-m", sp.model, "-o", last];
    return {
      cmd: "codex", stdin: opts.prompt,
      args: opts.resume ? ["exec", "resume", ...common, opts.resume, "-"] : ["exec", ...common, "-C", opts.cwd ?? process.cwd(), "-"],
      parse: (o, st, out, err, e, ms) => {
        logRun(o, st, out, err, e);
        const ev = jsonLines(out);
        let text = "";
        try { text = fs.readFileSync(last, "utf-8"); fs.unlinkSync(last); } catch { text = ev.filter((x) => x.item?.type === "agent_message").map((x) => x.item.text).pop() ?? ""; }
        const u = ev.filter((x) => x.type === "turn.completed").reduce((a, x) => ({ i: a.i + (x.usage?.input_tokens ?? 0), c: a.c + (x.usage?.cached_input_tokens ?? 0), o: a.o + (x.usage?.output_tokens ?? 0) + (x.usage?.reasoning_output_tokens ?? 0) }), { i: 0, c: 0, o: 0 });
        return { ok: st === 0 && !ev.some((x) => x.type === "turn.failed" || x.type === "error"), text, durationMs: ms, costUsd: 0, numTurns: ev.filter((x) => x.type === "turn.completed").length,
          inputTokens: u.i - u.c, outputTokens: u.o, cacheReadTokens: u.c, logPath: o.logPath, sessionId: ev.find((x) => x.type === "thread.started")?.thread_id ?? "" };
      },
    };
  }
  // opencode, and ollama models through opencode (provider "ollama" in the repo's opencode.json)
  const model = sp.provider === "ollama" ? `ollama/${sp.model}` : sp.model;
  return {
    cmd: "opencode", stdin: opts.prompt,
    args: ["run", "-m", model, "--format", "json", "--auto", ...(opts.resume ? ["--session", opts.resume] : [])],
    env: sp.provider === "ollama" ? { OPENCODE_CONFIG: OLLAMA_CONFIG } : undefined,
    parse: (o, st, out, err, e, ms) => {
      logRun(o, st, out, err, e);
      const ev = jsonLines(out);
      const fin = ev.filter((x) => x.type === "step_finish").map((x) => x.part ?? {});
      // the reply is the text of the last step that produced text
      const byMsg = new Map<string, string>();
      for (const x of ev) if (x.type === "text" && x.part?.text) byMsg.set(x.part.messageID, (byMsg.get(x.part.messageID) ?? "") + x.part.text);
      const text = [...byMsg.values()].pop() ?? "";
      const t = fin.reduce((a, f) => ({ i: a.i + (f.tokens?.input ?? 0), o: a.o + (f.tokens?.output ?? 0) + (f.tokens?.reasoning ?? 0), c: a.c + (f.tokens?.cache?.read ?? 0), cost: a.cost + (f.cost ?? 0) }), { i: 0, o: 0, c: 0, cost: 0 });
      return { ok: st === 0 && !ev.some((x) => x.type === "error"), text, durationMs: ms, costUsd: t.cost, numTurns: fin.length,
        inputTokens: t.i, outputTokens: t.o, cacheReadTokens: t.c, logPath: o.logPath, sessionId: ev[0]?.sessionID ?? "" };
    },
  };
}

/** agy is read-only (plan mode): fine for reviews and JSON answers, not for steps that write files. */
async function viaAgy(opts: AgentOptions, sp: Spec): Promise<AgentResult> {
  if (opts.tools.some((t) => /^(Write|Edit|Bash)/.test(t))) throw new Error(`${opts.model}: agy is read-only and this step writes files; pick another model in Settings → Models`);
  return runAgy({ prompt: opts.prompt, logPath: opts.logPath, model: sp.model, cwd: opts.cwd, conversation: opts.resume });
}

/** Ollama's server must be up for opencode to reach it; start it in the background if it is not. */
function ensureOllama() {
  const up = () => spawnSync("curl", ["-s", "-m", "2", "http://127.0.0.1:11434/api/version"], { encoding: "utf-8" }).status === 0;
  if (!up()) {
    spawn("ollama", ["serve"], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 20 && !up(); i++) spawnSync("sleep", ["0.5"]);
  }
  writeOllamaConfig();
}

/** The pipeline's own opencode config (gitignored) registering the locally pulled Ollama models as provider "ollama";
 *  passed with OPENCODE_CONFIG, so the user's global opencode config is never touched. */
const OLLAMA_CONFIG = path.join(REPO, "workspace/.opencode-ollama.json");
export function writeOllamaConfig() {
  const f = OLLAMA_CONFIG;
  let cfg: any = {};
  try { cfg = JSON.parse(fs.readFileSync(f, "utf-8")); } catch {}
  cfg.$schema ??= "https://opencode.ai/config.json";
  cfg.provider ??= {};
  cfg.provider.ollama = {
    npm: "@ai-sdk/openai-compatible", name: "Ollama (local)", options: { baseURL: "http://127.0.0.1:11434/v1" },
    models: Object.fromEntries(ollamaModels().map((m) => [m.id, { name: m.label, ...(cfg.provider.ollama?.models?.[m.id] ?? {}) }])),
  };
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n");
}

export function runAgent(opts: AgentOptions): AgentResult {
  const sp = parseSpec(opts.model);
  if (sp.provider === "agy") throw new Error("agy runs asynchronously: use runAgentAsync for read-only steps");
  if (sp.provider === "ollama") ensureOllama();
  const pl = plan(opts, sp);
  const t0 = Date.now();
  const res = spawnSync(pl.cmd, pl.args, {
    input: pl.stdin,
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
    cwd: opts.cwd ?? process.cwd(),
    env: { ...process.env, ...pl.env },
  });
  return pl.parse(opts, res.status, res.stdout ?? "", res.stderr ?? "", res.error?.message ?? "", Date.now() - t0);
}

/** Same as runAgent, without blocking: several agents can run in parallel. A `resume` that can't be used falls back
 *  to a fresh run with `fresh` (see AgentOptions). */
export async function runAgentAsync(opts: AgentOptions): Promise<AgentResult> {
  if (!opts.resume) return spawnAgent(opts);
  const sp = parseSpec(opts.model);
  const startFresh = (why: string) => {
    console.log(`   (${why}: starting a fresh session with the full brief)`);
    return spawnAgent({ ...opts, prompt: opts.fresh!, resume: undefined });
  };
  if ((sp.provider === "claude" || sp.provider === "claude-iit") && opts.fresh && !claudeHasSession(sp.provider, opts.resume))
    return startFresh(`the earlier session isn't in the ${sp.provider} profile`);
  const r = await spawnAgent(opts);
  if (!r.ok && opts.fresh && sessionMissing(r)) {
    const again = await startFresh("the earlier session could not be resumed");
    again.durationMs += r.durationMs;
    return again;
  }
  return r;
}

function spawnAgent(opts: AgentOptions): Promise<AgentResult> {
  const sp = parseSpec(opts.model);
  if (sp.provider === "agy") return viaAgy(opts, sp);
  if (sp.provider === "ollama") ensureOllama();
  const pl = plan(opts, sp);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn(pl.cmd, pl.args, { cwd: opts.cwd ?? process.cwd(), env: { ...process.env, ...pl.env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve(pl.parse(opts, null, stdout, stderr, e.message, Date.now() - t0)));
    child.on("close", (code) => resolve(pl.parse(opts, code, stdout, stderr, "", Date.now() - t0)));
    child.stdin.end(pl.stdin);
  });
}

/**
 * Free helper model: Antigravity's CLI (`agy`) with Gemini Flash, read-only (plan mode).
 * For cheap, low-stakes work only (the advisory frame critic, summaries); it can read
 * images by path. Returns the same shape as runAgentAsync, with costUsd 0.
 */
export function runAgy(opts: { prompt: string; logPath: string; model?: string; timeoutS?: number; cwd?: string; conversation?: string }): Promise<AgentResult> {
  const model = opts.model ?? process.env.AGY_MODEL ?? "gemini-3.8-flash-medium";
  const args = ["-p", opts.prompt, "--model", model, "--mode", "plan", "--output-format", "json", "--print-timeout", `${opts.timeoutS ?? 300}s`];
  if (opts.conversation) args.push("--conversation", opts.conversation);
  const t0 = Date.now();
  return new Promise((resolve) => {
    const done = (status: number | null, stdout: string, stderr: string, err: string) => {
      fs.mkdirSync(path.dirname(opts.logPath), { recursive: true });
      fs.writeFileSync(opts.logPath, `exit: ${status}\nerror: ${err}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`, "utf-8");
      let p: any = {};
      try { p = JSON.parse(stdout || "{}"); } catch {}
      const u = p.usage ?? {};
      resolve({
        ok: status === 0 && p.status === "SUCCESS",
        text: typeof p.response === "string" ? p.response : "",
        durationMs: Date.now() - t0,
        costUsd: 0,
        numTurns: Number(p.num_turns ?? 0),
        inputTokens: Number(u.input_tokens ?? 0),
        outputTokens: Number(u.output_tokens ?? 0) + Number(u.thinking_tokens ?? 0),
        cacheReadTokens: Number(u.cache_read_tokens ?? 0),
        logPath: opts.logPath,
        sessionId: typeof p.conversation_id === "string" ? p.conversation_id : "",
      });
    };
    const child = spawn("agy", args, { cwd: opts.cwd ?? process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => done(null, stdout, stderr, e.message));
    child.on("close", (code) => done(code, stdout, stderr, ""));
  });
}

/** First JSON object in a model's reply (tolerates code fences and prose around it). */
export function extractJson(text: string): any {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(s, e + 1));
}

/** runAgy for a JSON answer: if the reply has no JSON (Gemini sometimes ends its turn after looking at files), ask once more in the same conversation. */
export async function runAgyJson(opts: { prompt: string; logPath: string; model?: string }): Promise<{ r: AgentResult; json: any }> {
  let r = await runAgy(opts);
  try { return { r, json: extractJson(r.text) }; } catch {}
  const again = await runAgy({ ...opts, prompt: "Now reply with ONLY the JSON object described in my first message, nothing else.", conversation: r.sessionId, logPath: opts.logPath.replace(/(\.log)?$/, ".retry.log") });
  again.durationMs += r.durationMs; again.inputTokens += r.inputTokens; again.outputTokens += r.outputTokens;
  return { r: again, json: extractJson(again.text) };
}
