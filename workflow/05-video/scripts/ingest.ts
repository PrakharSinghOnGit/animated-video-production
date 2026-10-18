import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { probeAudio } from "../src/lib/audioProbe";
import { parseBrief } from "../src/lib/frontMatter";
import { normalizeTranscript } from "../src/lib/normalizeTranscript";
import { ConfigSchema } from "../src/lib/schema";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run ingest <job-id>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  console.log(`\n========================================`);
  console.log(`Ingesting Job: ${paths.jobId}`);
  console.log(`========================================`);

  fs.mkdirSync(paths.outputDir, { recursive: true });
  fs.mkdirSync(paths.planDir, { recursive: true });

  const logFile = path.join(paths.outputDir, "render.log");
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  function log(msg: string) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [INGEST] ${msg}`;
    console.log(msg);
    logStream.write(line + "\n");
  }

  log(`Resolved base job: ${paths.jobId} (isWorkspace: ${paths.isWorkspace})`);

  // 1. Verify Audio
  if (!paths.audioFile || !fs.existsSync(paths.audioFile)) {
    log(`ERROR: Missing required voiceover audio file in ${paths.inputDir}`);
    process.exit(1);
  }
  log(`Audio file: ${paths.audioFile}`);
  const audioInfo = await probeAudio(paths.audioFile);
  log(
    `Audio probed: ${audioInfo.durationSec.toFixed(2)}s (${audioInfo.durationMs}ms), ${audioInfo.codec}, ${audioInfo.sampleRate}Hz, ${audioInfo.channels}ch`
  );

  // 2. Verify Brief
  if (!paths.briefFile || !fs.existsSync(paths.briefFile)) {
    log(`ERROR: Missing required brief.md in ${paths.inputDir}`);
    process.exit(1);
  }
  log(`Brief file: ${paths.briefFile}`);
  const briefRaw = fs.readFileSync(paths.briefFile, "utf-8");
  const brief = parseBrief(briefRaw);
  log(`Brief validated: "${brief.frontMatter.title}" (${brief.frontMatter.topic})`);

  // 3. Verify Transcript
  if (!paths.transcriptFile || !fs.existsSync(paths.transcriptFile)) {
    log(`ERROR: Missing required transcript.json in ${paths.inputDir}`);
    process.exit(1);
  }
  log(`Transcript file: ${paths.transcriptFile}`);
  const transcriptRaw = fs.readFileSync(paths.transcriptFile, "utf-8");
  let parsedRawTranscript: unknown;
  try {
    parsedRawTranscript = JSON.parse(transcriptRaw);
  } catch {
    // Might be raw SRT
    parsedRawTranscript = transcriptRaw;
  }

  const normResult = normalizeTranscript(parsedRawTranscript, audioInfo.durationSec);
  log(
    `Transcript normalized: ${normResult.stats.wordCount} words, format "${normResult.formatDetected}", duration ${normResult.stats.durationMs}ms`
  );

  if (normResult.warnings.length > 0) {
    log(`Transcript warnings (${normResult.warnings.length}):`);
    for (const w of normResult.warnings) {
      log(`  - ${w}`);
    }
  }

  // 4. Config
  let rawConfig = {};
  if (paths.configFile && fs.existsSync(paths.configFile)) {
    try {
      rawConfig = JSON.parse(fs.readFileSync(paths.configFile, "utf-8"));
    } catch (err: any) {
      log(`WARN: Failed to parse config.json: ${err.message}. Using defaults.`);
    }
  }
  const config = ConfigSchema.parse(rawConfig);

  // 5. Save output artifacts
  const captionsPath = path.join(paths.outputDir, "captions.json");
  fs.writeFileSync(captionsPath, JSON.stringify(normResult.captions, null, 2), "utf-8");
  log(`Saved normalized captions to ${captionsPath}`);

  // Ingest report
  const reportContent = `# Ingest Report: ${paths.jobId}

**Date:** ${new Date().toISOString()}  
**Audio File:** \`${path.basename(paths.audioFile)}\`  
**Audio Duration:** ${audioInfo.durationSec.toFixed(2)}s (${audioInfo.durationMs} ms)  
**Sample Rate / Codec:** ${audioInfo.sampleRate} Hz / ${audioInfo.codec}  

## Transcript Facts
- **Format Detected:** \`${normResult.formatDetected}\`
- **Word Count:** ${normResult.stats.wordCount} words
- **Spoken Duration:** ${(normResult.stats.durationMs / 1000).toFixed(2)}s (${normResult.stats.durationMs} ms)
- **Silence Gaps (>1.5s):** ${normResult.stats.gapCount}

## Warnings
${
  normResult.warnings.length === 0
    ? "_None. Transcript passed all checks with zero warnings._"
    : normResult.warnings.map((w) => `- ${w}`).join("\n")
}

## Brief Front-matter
\`\`\`yaml
title: "${brief.frontMatter.title}"
topic: "${brief.frontMatter.topic}"
aspect: "${brief.frontMatter.aspect}"
accent: "${brief.frontMatter.accent}"
must_show: ${brief.frontMatter.must_show.length} items
\`\`\`
`;
  const reportPath = path.join(paths.planDir, "ingest-report.md");
  fs.writeFileSync(reportPath, reportContent, "utf-8");
  log(`Saved ingest report to ${reportPath}`);

  // 6. Copy assets to public/jobs/<job-id>/ for Remotion staticFile()
  const publicJobDir = path.resolve(process.cwd(), "public", "jobs", paths.jobId);
  fs.mkdirSync(publicJobDir, { recursive: true });

  const destAudio = path.join(publicJobDir, `audio${path.extname(paths.audioFile)}`);
  fs.copyFileSync(paths.audioFile, destAudio);
  fs.copyFileSync(captionsPath, path.join(publicJobDir, "captions.json"));
  log(`Mirrored audio & captions to public/jobs/${paths.jobId}/ for Remotion bundler`);

  // 7. Write job.json
  const jobSummary = {
    jobId: paths.jobId,
    createdAt: new Date().toISOString(),
    audio: {
      file: path.basename(paths.audioFile),
      ...audioInfo,
    },
    brief: brief.frontMatter,
    stats: normResult.stats,
    config,
    warnings: normResult.warnings,
  };
  fs.writeFileSync(path.join(paths.outputDir, "job.json"), JSON.stringify(jobSummary, null, 2), "utf-8");

  logStream.end();
  console.log(`\n✓ Ingest stage completed successfully for ${paths.jobId}.\n`);
}

main().catch((err) => {
  console.error(`\n❌ Ingest failed: ${err.message}\n`);
  process.exit(1);
});
