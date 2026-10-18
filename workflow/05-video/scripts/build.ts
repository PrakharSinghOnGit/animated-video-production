import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

interface JobStatus {
  jobId: string;
  stage: string;
  state: "idle" | "running" | "completed" | "failed";
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const STAGES = ["ingest", "analyze", "plan", "check", "render", "qc", "package"] as const;
type Stage = (typeof STAGES)[number];

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("-")) || "fixtures/sample-job";
  const isDraft = args.includes("--draft");
  const fromIndex = args.indexOf("--from");
  const fromStage = fromIndex !== -1 ? (args[fromIndex + 1] as Stage) : null;

  const paths = resolveJobPaths(target);
  console.log(`\n======================================================`);
  console.log(`🚀 MOTION ENGINE PIPELINE: ${paths.jobId}`);
  console.log(`======================================================`);
  console.log(`Profile: ${isDraft ? "DRAFT" : "FINAL"}`);
  console.log(`Target: ${target}`);
  if (fromStage) console.log(`Starting from stage: ${fromStage}`);

  const statusPath = path.join(paths.outputDir, "status.json");
  fs.mkdirSync(paths.outputDir, { recursive: true });

  const updateStatus = (stage: string, state: JobStatus["state"], error: string | null = null) => {
    const status: JobStatus = {
      jobId: paths.jobId,
      stage,
      state,
      error,
      startedAt: new Date().toISOString(),
      finishedAt: state === "completed" || state === "failed" ? new Date().toISOString() : null,
    };
    fs.writeFileSync(statusPath, JSON.stringify(status, null, 2), "utf-8");
  };

  const startIndex = fromStage ? STAGES.indexOf(fromStage) : 0;
  if (startIndex === -1) {
    console.error(`Invalid --from stage: "${fromStage}". Allowed: ${STAGES.join(", ")}`);
    process.exit(1);
  }

  for (let i = startIndex; i < STAGES.length; i++) {
    const stage = STAGES[i];
    console.log(`\n▶ Stage [${i + 1}/${STAGES.length}]: ${stage.toUpperCase()}`);
    updateStatus(stage, "running");

    try {
      let command = "";
      switch (stage) {
        case "ingest":
          command = `bun scripts/ingest.ts "${target}"`;
          break;
        case "analyze":
          command = `bun scripts/analyze.ts "${target}"`;
          break;
        case "plan":
          command = `bun scripts/plan.ts "${target}"`;
          break;
        case "check":
          command = `bun scripts/validate-plan.ts "${target}"`;
          break;
        case "render":
          command = `bun scripts/render.ts "${target}" ${isDraft ? "--draft" : "--final"}`;
          break;
        case "qc":
          command = `bun scripts/qc.ts "${target}"`;
          break;
        case "package":
          command = `bun scripts/package.ts "${target}"`;
          break;
      }

      console.log(`  $ ${command}`);
      execSync(command, { stdio: "inherit" });
      updateStatus(stage, "completed");
    } catch (err: any) {
      console.error(`\n❌ Stage ${stage} failed!`);
      updateStatus(stage, "failed", err.message);
      process.exit(1);
    }
  }

  updateStatus("all", "completed");
  console.log(`\n======================================================`);
  console.log(`✨ FULL BUILD PIPELINE SUCCEEDED FOR: ${paths.jobId}`);
  console.log(`   Deliverables in: ${paths.outputDir}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error("Fatal build error:", err);
  process.exit(1);
});
