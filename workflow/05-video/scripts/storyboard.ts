import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { compactTranscript } from "../src/lib/transcript";
import { execSync, spawnSync } from "node:child_process";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;
  let autoMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (args[i] === "--auto") {
      autoMode = true;
    } else if (!args[i].startsWith("-") && !videoId) {
      videoId = args[i];
    }
  }

  return {
    videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market",
    autoMode,
  };
}

async function main() {
  const { videoId, autoMode } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Generating Storyboard Prompt for: ${paths.jobId}`);
  console.log(`========================================`);

  const reviewDir = path.join(paths.outputDir, "review");
  fs.mkdirSync(reviewDir, { recursive: true });

  // 1. Read STORYBOARD prompt template
  const promptTemplatePaths = [
    path.resolve(process.cwd(), "workflow", "prompts", "STORYBOARD.md"),
    path.resolve(process.cwd(), "_migration", "STORYBOARD.md"),
  ];
  const templatePath = promptTemplatePaths.find((p) => fs.existsSync(p));
  const promptTemplate = templatePath ? fs.readFileSync(templatePath, "utf-8") : "You are the Art Director.";

  // 2. Read KIT_API summary
  const kitApiPaths = [
    path.resolve(process.cwd(), "packages", "kit", "KIT_API.md"),
    path.resolve(process.cwd(), "_migration", "KIT_API.md"),
  ];
  const kitApiPath = kitApiPaths.find((p) => fs.existsSync(p));
  const kitApi = kitApiPath ? fs.readFileSync(kitApiPath, "utf-8") : "";

  // 2b. Archetype catalog, generated from the kit registry (always current)
  const { archetypeCatalogMarkdown } = await import("@wealthgap/kit");
  const archetypeCatalog = archetypeCatalogMarkdown();

  // 3. Transcript: one timestamped line per sentence from the aligned captions.
  // (The raw word-level JSON was ~224 KB; sentence lines carry the same timing for
  // scene boundaries, and every anchor word is still present in the text.)
  const captionsFile = path.join(paths.outputDir, "captions.json");
  const transcript = fs.existsSync(captionsFile)
    ? compactTranscript(JSON.parse(fs.readFileSync(captionsFile, "utf-8")))
    : paths.transcriptFile && fs.existsSync(paths.transcriptFile)
    ? fs.readFileSync(paths.transcriptFile, "utf-8")
    : "";

  // 4. Read script
  const scriptContent = paths.briefFile && fs.existsSync(paths.briefFile)
    ? fs.readFileSync(paths.briefFile, "utf-8")
    : "";

  // 5. Build full prompt
  const fullPrompt = `${promptTemplate}

---

# CONTEXT & INPUTS FOR VIDEO: ${paths.jobId}

## 1. Raw Written Script
\`\`\`markdown
${scriptContent}
\`\`\`

## 2. Spoken Transcript (The Clock): \`[startMs-endMs] sentence\`
\`\`\`text
${transcript}
\`\`\`

## 3. Archetype Catalog (prefer these; see "Archetypes first" in the rules)
${archetypeCatalog}

## 4. Kit API Summary (primitives for custom scenes)
\`\`\`markdown
${kitApi}
\`\`\`

---

Please return ONLY the valid JSON storyboard object matching the schema in Section 6. Save as storyboard.json.
`;

  const promptFile = path.join(reviewDir, "storyboard_prompt.txt");
  fs.writeFileSync(promptFile, fullPrompt, "utf-8");
  console.log(`✓ Wrote complete storyboard prompt to: ${promptFile}`);

  const storyboardFile = path.join(paths.outputDir, "storyboard.json");

  if (autoMode) {
    const ok = runAutoStoryboard(fullPrompt, storyboardFile, paths.jobId, reviewDir);
    process.exit(ok ? 0 : 1);
  }

  // Check if storyboard.json already exists
  if (fs.existsSync(storyboardFile)) {
    console.log(`\nExisting storyboard.json found at ${storyboardFile}. Running storyboard:check...`);
    execSync(`bun run workflow/05-video/scripts/storyboard_check.ts --video ${paths.jobId}`, {
      stdio: "inherit",
    });
  } else {
    console.log(`\n======================================================`);
    console.log(`Manual Mode:`);
    console.log(`1. Copy prompt from: ${promptFile}`);
    console.log(`2. Paste into Claude / Gemini to generate storyboard.json`);
    console.log(`3. Save JSON to: ${storyboardFile}`);
    console.log(`4. Run: bun run storyboard:check --video ${paths.jobId}`);
    console.log(`======================================================\n`);
  }
}

/**
 * Pacing and variety limits the prompt asks for, enforced here so the loop rejects
 * a storyboard that drifts into rapid cuts or text-only scenes.
 */
function storyboardMixFailures(storyboardFile: string): string[] {
  const scenes: any[] = JSON.parse(fs.readFileSync(storyboardFile, "utf-8")).scenes ?? [];
  if (scenes.length === 0) return ["storyboard has no scenes"];
  const failures: string[] = [];
  const share = (pred: (s: any) => boolean) => scenes.filter(pred).length / scenes.length;
  const totalSec = (scenes[scenes.length - 1].endMs - scenes[0].startMs) / 1000;
  const avgSec = totalSec / scenes.length;

  if (avgSec < 8) {
    failures.push(
      `Pacing: ${scenes.length} scenes averaging ${avgSec.toFixed(1)} s. Target 8-18 s per scene (~${Math.round(totalSec / 13)} scenes for ${Math.round(totalSec)} s). Merge consecutive scenes that share an idea; let archetype beats evolve within a scene.`
    );
  }
  const headline = share((s) => s.archetype === "KineticHeadline");
  if (headline > 0.18) {
    failures.push(`Mix: KineticHeadline is ${(headline * 100).toFixed(0)}% of scenes (max ~15%). Replace the weakest ones with data/diagram/map archetypes.`);
  }
  const custom = share((s) => !s.archetype);
  if (custom > 0.3) {
    failures.push(`Mix: custom scenes are ${(custom * 100).toFixed(0)}% (max ~25%). Convert ones whose customReason is weak into archetypes.`);
  }
  const missingReason = scenes.filter((s) => !s.archetype && !s.customReason).map((s) => s.id);
  if (missingReason.length > 0) failures.push(`Custom scenes without customReason: ${missingReason.join(", ")}`);
  // Late payoff: an archetype scene whose first main beat lands deep into the scene
  // shows a half-built frame for most of its length (e.g. bars waiting on a final word).
  const captionsFile = path.join(path.dirname(storyboardFile), "captions.json");
  if (fs.existsSync(captionsFile)) {
    const words: { text: string; startMs: number; endMs: number }[] = JSON.parse(fs.readFileSync(captionsFile, "utf-8"));
    const clean = (t: string) => t.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9']/g, "");
    for (const sc of scenes) {
      const cue = primaryCue(sc);
      if (typeof cue !== "string") continue;
      const [w, occ] = cue.split("#");
      const inScene = words.filter((x) => x.startMs >= sc.startMs - 50 && x.endMs <= sc.endMs + 50);
      const hit = inScene.filter((x) => clean(x.text) === clean(w))[(parseInt(occ, 10) || 1) - 1];
      if (!hit) continue;
      const delaySec = (hit.startMs - sc.startMs) / 1000;
      const durSec = (sc.endMs - sc.startMs) / 1000;
      if (delaySec > 4 && delaySec / durSec > 0.45) {
        failures.push(
          `Late payoff in ${sc.id} (${sc.archetype}): its main beat "${cue}" lands ${delaySec.toFixed(1)} s into a ${durSec.toFixed(1)} s scene. Move the lead-in narration into the previous scene (re-cut the boundary) or pick an earlier cue, so the visual builds within the first ~3-4 s.`
        );
      }
    }
  }

  for (let i = 2; i < scenes.length; i++) {
    const a = scenes[i].archetype ?? "custom";
    if (a !== "custom" && a === scenes[i - 1].archetype && a === scenes[i - 2].archetype) {
      failures.push(`Variety: ${scenes[i - 2].id}-${scenes[i].id} are three ${a} scenes in a row.`);
    }
  }
  return failures;
}

/** The cue that triggers an archetype's main visual (undefined = starts with the scene). */
function primaryCue(sc: any): unknown {
  const p = sc.props ?? {};
  switch (sc.archetype) {
    case "BarChart": return p.growAt;
    case "LineChart": return p.drawAt;
    case "StatReveal": return p.countAt;
    case "Diagram": return p.nodes?.[0]?.at;
    case "Timeline": return p.events?.[0]?.at;
    case "KineticHeadline": return p.startAt;
    case "WorldMap":
      return [p.highlight?.[0]?.at, p.focus?.[0]?.at, p.markers?.[0]?.at, p.flows?.[0]?.at].find((c) => c !== undefined);
    default: return undefined;
  }
}

/**
 * Headless storyboard: Opus writes storyboard.json, then storyboard:check and the
 * archetype validator (via assemble) must pass. Errors are fed back, max 3 attempts.
 */
function runAutoStoryboard(prompt: string, storyboardFile: string, jobId: string, reviewDir: string): boolean {
  const model = process.env.STORYBOARD_MODEL || "opus";
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n🤖 [auto] Storyboard attempt ${attempt}/3 with ${model}...`);
    const task = attempt === 1
      ? `${prompt}\n\nWrite the storyboard JSON to this exact path with the Write tool: ${storyboardFile}\nDo not write any other file.`
      : `The storyboard at ${storyboardFile} failed validation. Fix ONLY what the errors below require (Read the file, then Write the corrected full JSON back to the same path). Keep everything else.\n\nErrors:\n${feedback}`;
    const res = spawnSync(
      "claude",
      ["-p", "--model", model, "--output-format", "json", "--permission-mode", "acceptEdits", "--allowedTools", "Read", "Write"],
      { input: task, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );
    fs.writeFileSync(
      path.join(reviewDir, `storyboard_auto_${attempt}.log`),
      `exit: ${res.status}\n--- stdout ---\n${res.stdout ?? ""}\n--- stderr ---\n${res.stderr ?? ""}\n`,
      "utf-8"
    );
    if (res.status !== 0 || !fs.existsSync(storyboardFile)) {
      feedback = `The agent run failed or did not write ${storyboardFile} (exit ${res.status}).`;
      console.error(`❌ ${feedback}`);
      continue;
    }

    const checks = [
      `bun run workflow/05-video/scripts/storyboard_check.ts --video ${jobId}`,
      `bun run workflow/05-video/scripts/assemble.ts --video ${jobId}`,
    ];
    const failures: string[] = [...storyboardMixFailures(storyboardFile)];
    for (const cmd of checks) {
      try {
        execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
      } catch (err: any) {
        failures.push(`$ ${cmd}\n${(err.stdout || "") + (err.stderr || "")}`.slice(0, 6000));
      }
    }
    if (failures.length === 0) {
      console.log(`✅ [auto] storyboard.json passed storyboard:check and archetype validation.`);
      return true;
    }
    feedback = failures.join("\n\n");
    console.warn(`⚠️ [auto] Validation failed; feeding errors back.\n${feedback.slice(0, 1500)}`);
  }
  console.error(`❌ [auto] Storyboard still invalid after 3 attempts. See ${reviewDir}/storyboard_auto_*.log`);
  return false;
}

main().catch((err) => {
  console.error(`\n❌ Storyboard step failed: ${err.message}\n`);
  process.exit(1);
});
