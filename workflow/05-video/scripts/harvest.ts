import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--video" || args[i] === "-v") {
      videoId = args[i + 1];
      i++;
    } else if (!args[i].startsWith("-") && !videoId) {
      videoId = args[i];
    }
  }

  return { videoId: videoId || process.env.ACTIVE_VIDEO || "VID01_Currency_Market" };
}

async function main() {
  const { videoId } = parseArgs();
  const paths = resolveJobPaths(videoId);

  console.log(`\n========================================`);
  console.log(`Harvesting Reusable Kit Candidates from: ${paths.jobId}`);
  console.log(`========================================`);

  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  const reviewDir = path.join(paths.outputDir, "review");
  fs.mkdirSync(reviewDir, { recursive: true });

  const kitRequestsFile = path.join(reviewDir, "kit-requests.md");
  let requestedItems: string[] = [];
  if (fs.existsSync(kitRequestsFile)) {
    const rawReq = fs.readFileSync(kitRequestsFile, "utf-8");
    requestedItems = rawReq
      .split("\n")
      .filter((l) => l.trim().startsWith("-") || l.trim().startsWith("*"));
  }

  const sceneFiles = fs.existsSync(scenesDir)
    ? fs.readdirSync(scenesDir).filter((f) => f.endsWith(".tsx") && f !== "index.ts")
    : [];

  const candidates: Array<{
    scene: string;
    type: string;
    description: string;
    proposedApi: string;
  }> = [];

  // Scan scenes for custom inline functions, SVG patterns, or sub-components
  for (const sf of sceneFiles) {
    const content = fs.readFileSync(path.join(scenesDir, sf), "utf-8");

    // Check for custom SVG paths or functions
    if (content.includes("function draw") || content.includes("const draw")) {
      candidates.push({
        scene: sf,
        type: "Drawing Helper",
        description: "Custom geometric drawing function found in scene code.",
        proposedApi: "<ShapeDraw path={...} stroke={...} />",
      });
    }

    // Check for inline mesh or Three.js setup
    if (content.includes("mesh") && !content.includes("Globe3D")) {
      candidates.push({
        scene: sf,
        type: "3D Component",
        description: "Custom 3D mesh choreography that can be generalized into a kit primitive.",
        proposedApi: "<MeshObject geometry={...} material={...} />",
      });
    }

    // Check for complex particle or network patterns
    if (content.includes("connections") || content.includes("links")) {
      candidates.push({
        scene: sf,
        type: "Network Graph",
        description: "Node and edge connectivity layout.",
        proposedApi: "<NetworkGraph nodes={...} edges={...} />",
      });
    }
  }

  // Generate harvest-report.md
  let report = `# Kit Harvest Report: ${paths.jobId}\n\n`;
  report += `**Generated:** ${new Date().toISOString()}  \n`;
  report += `**Scenes Scanned:** ${sceneFiles.length}  \n\n`;

  report += `## 1. Author Kit Requests\n`;
  if (requestedItems.length > 0) {
    report += requestedItems.join("\n") + "\n\n";
  } else {
    report += `_No pending requests recorded in review/kit-requests.md._\n\n`;
  }

  report += `## 2. Identified Promotion Candidates\n\n`;
  if (candidates.length === 0) {
    report += `_All current scenes use standardized @wealthgap/kit primitives. No redundant custom components detected._\n`;
  } else {
    report += `| Scene | Component Type | Description | Proposed Kit API |\n`;
    report += `|---|---|---|---|\n`;
    for (const c of candidates) {
      report += `| \`${c.scene}\` | **${c.type}** | ${c.description} | \`${c.proposedApi}\` |\n`;
    }
  }

  report += `\n---\n*Note: The harvest script is read-only and does not modify any source code.*`;

  const reportPath = path.join(reviewDir, "harvest-report.md");
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`✓ Harvest report written to: ${reportPath}`);
  console.log(`Identified ${candidates.length} promotion candidate(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
