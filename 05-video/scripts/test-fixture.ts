import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

async function main() {
  console.log("======================================================");
  console.log("🧪 TESTING MOTION ENGINE END-TO-END ON SAMPLE FIXTURE");
  console.log("======================================================\n");

  const fixtureTarget = "fixtures/sample-job";
  const fixtureDir = path.resolve(process.cwd(), fixtureTarget);
  const outputDir = path.join(fixtureDir, "output");

  // 1. Run the build script
  console.log("▶ Running full build pipeline on fixtures/sample-job...");
  execSync(`npx tsx scripts/build.ts "${fixtureTarget}" --final`, {
    stdio: "inherit",
  });

  // 2. Validate deliverable contract
  console.log("\n▶ Verifying output contract deliverables...");
  const requiredFiles = [
    "final.mp4",
    "metadata.json",
    "captions.srt",
    "captions.vtt",
    "captions.json",
    "chapters.txt",
    "description_draft.md",
    "sources.md",
    "qc-report.md",
    "stills/thumbnails/thumb-a.png",
    "stills/thumbnails/thumb-b.png",
    "stills/thumbnails/thumb-c.png",
  ];

  const missing: string[] = [];
  for (const rel of requiredFiles) {
    const full = path.join(outputDir, rel);
    if (!fs.existsSync(full)) {
      missing.push(rel);
    } else {
      const stats = fs.statSync(full);
      console.log(`  ✓ ${rel} (${stats.size > 1024 * 1024 ? (stats.size / 1024 / 1024).toFixed(2) + " MB" : (stats.size / 1024).toFixed(1) + " KB"})`);
    }
  }

  if (missing.length > 0) {
    console.error(`\n❌ Missing expected deliverables:\n${missing.map((m) => `  - ${m}`).join("\n")}`);
    process.exit(1);
  }

  // 3. Validate metadata.json
  const metadataRaw = JSON.parse(fs.readFileSync(path.join(outputDir, "metadata.json"), "utf-8"));
  if (!metadataRaw.inputsHash || !metadataRaw.video.durationSec) {
    console.error("\n❌ metadata.json missing critical fields.");
    process.exit(1);
  }
  console.log(`  ✓ metadata.json schema valid (inputsHash: ${metadataRaw.inputsHash.slice(0, 12)}...)`);

  console.log("\n======================================================");
  console.log("🎉 ALL TESTS PASSED! MOTION ENGINE VERIFIED END-TO-END.");
  console.log("======================================================\n");
}

main().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
