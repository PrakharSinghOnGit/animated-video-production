#!/usr/bin/env bun
/**
 * Name (or rename) a project from what it is about.
 *
 *   bun run rename --video VID07_Untitled                 a cheap model names it from the idea/script → VID07_<Name>
 *   bun run rename --video VID07_Untitled --name Sticky_Prices
 *   bun run rename --video VID07_Untitled --suggest       only print the suggested name (NAME: ...), change nothing
 *   [--agent haiku]                                        the naming model (role projectName, default Haiku)
 *
 * The number stays; the folder moves and the old id is rewritten in the project's text files and in
 * workspace/_ideas and workspace/_analytics (see workflow/lib/rename.ts). Then bun install relinks the workspaces.
 * Don't rename while a job of the project is running. The dashboard names untitled projects by itself.
 */
import path from "node:path";
import { execSync } from "node:child_process";
import { nameSource, renameWorkspace, slugName, REPO } from "../workflow/lib/rename";
import { roleModel, isAgy, agyModel, specSlug } from "../workflow/lib/models";
import { runAgentAsync, runAgyJson, extractJson } from "../workflow/05-video/src/lib/agent";
import { recordTiming } from "../workflow/05-video/src/lib/timings";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ws = flag("--video");
if (!ws) { console.error("Usage: bun run rename --video <VIDEO_ID> [--name New_Name] [--suggest] [--agent haiku]"); process.exit(1); }
const dir = path.join(REPO, "workspace", ws);

async function suggest(): Promise<string> {
  const src = nameSource(ws!);
  if (!src) throw new Error("nothing to name it from yet: write the idea (02-scripting/idea.md) or the script first");
  const prompt = `Name this YouTube video project folder. Reply with ONLY {"name": "..."}: 2 to 4 words that say what the video is about, Title_Case joined by underscores, letters and digits only, no number prefix, no "Video"/"Explainer". Examples: Pseudo_Rich, Stop_Hunt, AI_Bubble, Sticky_Prices.\n\n${src}`;
  const model = roleModel("projectName", flag("--agent"));
  const logPath = path.join(dir, "02-scripting/logs", `name_${specSlug(model)}.log`);
  let json: any = null;
  try {
    if (isAgy(model)) json = (await runAgyJson({ prompt, model: agyModel(model), logPath })).json;
    else {
      const r = await runAgentAsync({ prompt, model, tools: ["Read"], maxTurns: 2, logPath, cwd: REPO });
      recordTiming(dir, { step: `name project (${model})`, ms: r.durationMs, model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens });
      json = extractJson(r.text);
    }
  } catch (e) { console.warn(`   ⚠️  naming model failed (${(e as Error).message}); using the idea's first words`); }
  const name = slugName(String(json?.name ?? ""), 5);
  if (name && !/^untitled$/i.test(name)) return name;
  // fallback: the first heading or line of the source
  const first = src.split("\n").map((l) => l.replace(/^(Video title:|Idea:|Script \(start\):)\s*/, "").replace(/^#+\s*/, "").trim()).find((l) => l.length > 3) ?? "";
  const f = slugName(first, 4);
  if (!f) throw new Error("could not derive a name");
  return f;
}

try {
  const name = flag("--name") ?? (await suggest());
  if (args.includes("--suggest")) { console.log(`NAME: ${name}`); process.exit(0); }
  const r = renameWorkspace(ws, name);
  console.log(`✏️  ${ws} → ${r.id} (${r.changed.length} file${r.changed.length === 1 ? "" : "s"} updated)`);
  try { execSync("bun install", { cwd: REPO, stdio: "inherit" }); } catch { console.warn("⚠️  bun install failed; run it by hand"); }
} catch (e) { console.error(`❌ ${(e as Error).message}`); process.exit(1); }
