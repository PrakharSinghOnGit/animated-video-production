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
