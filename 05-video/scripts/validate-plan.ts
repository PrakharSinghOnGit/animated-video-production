import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { ScenesFileSchema, CaptionsListSchema, type Scene } from "../src/lib/schema";
import { COMPONENT_REGISTRY, validateComponentProps } from "../src/lib/registry";
import { cleanWord } from "../src/lib/timing";

interface ValidationIssue {
  type: "ERROR" | "WARN";
  sceneId?: string;
  message: string;
}

export function validateScenes(
  scenesData: unknown,
  captionsData?: unknown
): { isValid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  // 1. Zod Schema Check
  const parseResult = ScenesFileSchema.safeParse(scenesData);
  if (!parseResult.success) {
    for (const err of parseResult.error.issues) {
      issues.push({
        type: "ERROR",
        message: `Schema violation at '${err.path.join(".")}': ${err.message}`,
      });
    }
    return { isValid: false, issues };
  }

  const file = parseResult.data;
  const scenes = file.scenes;

  if (scenes.length === 0) {
    issues.push({ type: "ERROR", message: "Plan has 0 scenes." });
    return { isValid: false, issues };
  }

  // 2. Timeline Coverage & Gap/Overlap Checks
  if (scenes[0].startMs !== 0) {
    issues.push({
      type: "ERROR",
      sceneId: scenes[0].id,
      message: `First scene must start at 0ms, but starts at ${scenes[0].startMs}ms.`,
    });
  }

  for (let i = 0; i < scenes.length - 1; i++) {
    const cur = scenes[i];
    const nxt = scenes[i + 1];

    if (cur.endMs !== nxt.startMs) {
      if (cur.endMs < nxt.startMs) {
        issues.push({
          type: "ERROR",
          sceneId: cur.id,
          message: `Coverage gap of ${nxt.startMs - cur.endMs}ms between scene ${cur.id} and ${nxt.id}.`,
        });
      } else {
        issues.push({
          type: "ERROR",
          sceneId: cur.id,
          message: `Coverage overlap of ${cur.endMs - nxt.startMs}ms between scene ${cur.id} and ${nxt.id}.`,
        });
      }
    }
  }

  // 3. Per-scene Duration, Component & Prop Checks
  let consecutiveComponent = "";
  let consecutiveCount = 0;

  for (const scene of scenes) {
    const durMs = scene.endMs - scene.startMs;
    const durSec = durMs / 1000;

    // Duration limits: min 2s, max 12s
    if (durSec < 2.0) {
      issues.push({
        type: "ERROR",
        sceneId: scene.id,
        message: `Duration (${durSec.toFixed(2)}s) is below 2.0s minimum.`,
      });
    } else if (durSec > 12.0) {
      issues.push({
        type: "WARN",
        sceneId: scene.id,
        message: `Duration (${durSec.toFixed(2)}s) exceeds 12.0s maximum. Sub-beat recommended.`,
      });
    }

    // Foreground components validation
    if (!scene.layers.foreground || scene.layers.foreground.length === 0) {
      issues.push({
        type: "ERROR",
        sceneId: scene.id,
        message: `Scene has no foreground components.`,
      });
    } else {
      const primaryComp = scene.layers.foreground[0].component;

      // Check variety rule (max 2 in a row)
      if (primaryComp === consecutiveComponent) {
        consecutiveCount++;
        if (consecutiveCount > 2) {
          issues.push({
            type: "WARN",
            sceneId: scene.id,
            message: `Component "${primaryComp}" used ${consecutiveCount} times in a row. Variety rule allows max 2.`,
          });
        }
      } else {
        consecutiveComponent = primaryComp;
        consecutiveCount = 1;
      }

      for (const elem of scene.layers.foreground) {
        if (!COMPONENT_REGISTRY[elem.component]) {
          issues.push({
            type: "ERROR",
            sceneId: scene.id,
            message: `Unknown component "${elem.component}". Not found in registry.`,
          });
        } else {
          const propVal = validateComponentProps(elem.component, elem.props);
          if (!propVal.success) {
            issues.push({
              type: "ERROR",
              sceneId: scene.id,
              message: propVal.error || `Invalid props for ${elem.component}`,
            });
          }
        }
      }
    }
  }

  // 4. Captions & Anchors verification (if captions provided)
  if (captionsData) {
    const captionsResult = CaptionsListSchema.safeParse(captionsData);
    if (captionsResult.success) {
      const captions = captionsResult.data;
      for (const scene of scenes) {
        for (const elem of scene.layers.foreground) {
          if (elem.anchors) {
            for (const anc of elem.anchors) {
              const cleanTarget = cleanWord(anc.word);
              const matchingInScene = captions.some(
                (c) =>
                  c.startMs >= scene.startMs - 300 &&
                  c.endMs <= scene.endMs + 300 &&
                  cleanWord(c.text).includes(cleanTarget)
              );
              if (!matchingInScene) {
                issues.push({
                  type: "WARN",
                  sceneId: scene.id,
                  message: `Anchor word "${anc.word}" was not found spoken within scene [${scene.startMs}ms, ${scene.endMs}ms]. Midpoint fallback will be used.`,
                });
              }
            }
          }
        }
      }
    }
  }

  const hasErrors = issues.some((i) => i.type === "ERROR");
  return { isValid: !hasErrors, issues };
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run check <job-id>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  console.log(`\n========================================`);
  console.log(`Validating Storyboard Plan: ${paths.jobId}`);
  console.log(`========================================`);

  const scenesPath = path.join(paths.outputDir, "scenes.json");
  if (!fs.existsSync(scenesPath)) {
    console.error(`ERROR: scenes.json not found at ${scenesPath}. Run 'npm run plan ${target}' first.`);
    process.exit(1);
  }

  const scenesRaw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  let captionsRaw: unknown = undefined;
  const captionsPath = path.join(paths.outputDir, "captions.json");
  if (fs.existsSync(captionsPath)) {
    captionsRaw = JSON.parse(fs.readFileSync(captionsPath, "utf-8"));
  }

  const { isValid, issues } = validateScenes(scenesRaw, captionsRaw);

  const errors = issues.filter((i) => i.type === "ERROR");
  const warnings = issues.filter((i) => i.type === "WARN");

  console.log(`Results: ${errors.length} errors, ${warnings.length} warnings\n`);

  if (warnings.length > 0) {
    console.log("⚠️  Warnings:");
    for (const w of warnings) {
      console.log(`  - [${w.sceneId || "general"}] ${w.message}`);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log("❌ Fatal Errors:");
    for (const e of errors) {
      console.log(`  - [${e.sceneId || "general"}] ${e.message}`);
    }
    console.log();
    process.exit(1);
  }

  console.log(`✓ Storyboard plan passed validation with exit code 0!\n`);
}

if (process.argv[1]?.endsWith("validate-plan.ts")) {
  main().catch((err) => {
    console.error(`Validation runner failed: ${err.message}`);
    process.exit(1);
  });
}
