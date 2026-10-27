/**
 * Headless Claude Code runs for agent stages (director, act author, critic).
 * The prompt goes over stdin, tools are pre-approved so a run never stalls on a
 * permission prompt, and the full output is logged. Cost, tokens and wall time
 * come back from `--output-format json` so every stage can be accounted for.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

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
}

function cliArgs(opts: AgentOptions): string[] {
  const args = ["-p", "--model", opts.model, "--output-format", "json", "--permission-mode", "acceptEdits"];
  if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));
  if (opts.resume) args.push("--resume", opts.resume);
  args.push("--allowedTools", ...opts.tools);
  return args;
}

function finish(opts: AgentOptions, status: number | null, stdout: string, stderr: string, errMsg: string, durationMs: number): AgentResult {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true });
  fs.writeFileSync(opts.logPath, `exit: ${status}\nerror: ${errMsg}\n\n--- stdout ---\n${stdout}\n\n--- stderr ---\n${stderr}\n`, "utf-8");

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

export function runAgent(opts: AgentOptions): AgentResult {
  const t0 = Date.now();
  const res = spawnSync("claude", cliArgs(opts), {
    input: opts.prompt,
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
    cwd: opts.cwd ?? process.cwd(),
  });
  return finish(opts, res.status, res.stdout ?? "", res.stderr ?? "", res.error?.message ?? "", Date.now() - t0);
}

/** Same as runAgent, without blocking: several agents can run in parallel. */
export function runAgentAsync(opts: AgentOptions): Promise<AgentResult> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const child = spawn("claude", cliArgs(opts), { cwd: opts.cwd ?? process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve(finish(opts, null, stdout, stderr, e.message, Date.now() - t0)));
    child.on("close", (code) => resolve(finish(opts, code, stdout, stderr, "", Date.now() - t0)));
    child.stdin.end(opts.prompt);
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
