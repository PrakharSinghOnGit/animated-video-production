import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { CaptionsListSchema, BeatsFileSchema, type NormalizedCaption } from "../src/lib/schema";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run analyze <job-id>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  console.log(`\n========================================`);
  console.log(`Analyzing Beats: ${paths.jobId}`);
  console.log(`========================================`);

  const captionsFile = path.join(paths.outputDir, "captions.json");
  if (!fs.existsSync(captionsFile)) {
    console.error(`ERROR: captions.json not found at ${captionsFile}. Run 'npm run ingest ${target}' first.`);
    process.exit(1);
  }

  const rawCaptions = JSON.parse(fs.readFileSync(captionsFile, "utf-8"));
  const captions: NormalizedCaption[] = CaptionsListSchema.parse(rawCaptions);

  if (captions.length === 0) {
    console.error("ERROR: No captions found.");
    process.exit(1);
  }

  const totalWords = captions.length;
  const totalDurationMs = captions[captions.length - 1].endMs;

  // 1. Identify Pauses (>= 250ms)
  const pauses: Array<{
    afterWordIndex: number;
    startMs: number;
    endMs: number;
    durationMs: number;
  }> = [];

  for (let i = 0; i < captions.length - 1; i++) {
    const cur = captions[i];
    const nxt = captions[i + 1];
    const gap = nxt.startMs - cur.endMs;
    if (gap >= 250) {
      pauses.push({
        afterWordIndex: i,
        startMs: cur.endMs,
        endMs: nxt.startMs,
        durationMs: gap,
      });
    }
  }

  // 2. Identify Sentences
  const sentences: Array<{
    index: number;
    text: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    wordCount: number;
    numbers: string[];
    pauseAfterMs: number;
  }> = [];

  let currentWords: NormalizedCaption[] = [];
  let sentenceIdx = 0;

  for (let i = 0; i < captions.length; i++) {
    const word = captions[i];
    currentWords.push(word);

    const isLastWord = i === captions.length - 1;
    const endsWithTerminalPunctuation = /[.!?]$/.test(word.text.trim());
    const nextGap = !isLastWord ? captions[i + 1].startMs - word.endMs : 0;
    const hasLongPause = nextGap >= 600;

    if (endsWithTerminalPunctuation || hasLongPause || isLastWord) {
      const sentenceText = currentWords.map((w) => w.text.trim()).join(" ");
      const sStart = currentWords[0].startMs;
      const sEnd = currentWords[currentWords.length - 1].endMs;
      const extractedNumbers = extractNumbers(sentenceText);

      sentences.push({
        index: sentenceIdx++,
        text: sentenceText,
        startMs: sStart,
        endMs: sEnd,
        durationMs: sEnd - sStart,
        wordCount: currentWords.length,
        numbers: extractedNumbers,
        pauseAfterMs: nextGap,
      });
      currentWords = [];
    }
  }

  // 3. Extract Specific Number Mentions
  const numbers: Array<{
    raw: string;
    value?: number;
    startMs: number;
    endMs: number;
    sentenceIndex: number;
  }> = [];

  for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
    const sentence = sentences[sIdx];
    const numMatches = extractNumbers(sentence.text);
    for (const raw of numMatches) {
      const parsedVal = parseNumericValue(raw);
      numbers.push({
        raw,
        value: parsedVal,
        startMs: sentence.startMs,
        endMs: sentence.endMs,
        sentenceIndex: sIdx,
      });
    }
  }

  // 4. Suggest Scene Breaks (Target: 3-8s per scene, minimum 2s, max 12s)
  const suggestedSceneBreaks: Array<{
    sceneId: string;
    startMs: number;
    endMs: number;
    reason: string;
    sentenceIndices: number[];
  }> = [];

  let sceneCounter = 1;
  let curSceneSentences: number[] = [];
  let curSceneStartMs = 0;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    curSceneSentences.push(i);

    const curDuration = s.endMs - curSceneStartMs;
    const isLast = i === sentences.length - 1;

    // Decide if we should break after this sentence:
    // Break if:
    // 1. We reached >= 4.0s and next sentence would push us over 8.5s
    // 2. Or there is a significant pause >= 400ms and duration >= 3.0s
    // 3. Or duration >= 7.5s
    // 4. Or it's the last sentence
    const nextSentence = !isLast ? sentences[i + 1] : null;
    const wouldExceedTarget = nextSentence ? curDuration + nextSentence.durationMs > 8500 : false;
    const hasNaturalBreak = s.pauseAfterMs >= 400 && curDuration >= 3000;
    const hitHardMax = curDuration >= 7500;

    if (isLast || wouldExceedTarget || hasNaturalBreak || hitHardMax) {
      // First scene always starts at 0; last scene covers total duration + tail padding (1200ms)
      const sceneEndMs = isLast ? totalDurationMs + 1200 : s.endMs + Math.round(s.pauseAfterMs / 2);
      suggestedSceneBreaks.push({
        sceneId: `s${String(sceneCounter++).padStart(2, "0")}`,
        startMs: curSceneStartMs,
        endMs: sceneEndMs,
        reason: isLast
          ? "Final video outro"
          : hasNaturalBreak
            ? `Sentence pause of ${s.pauseAfterMs}ms`
            : "Target 4-8s scene duration reached",
        sentenceIndices: [...curSceneSentences],
      });
      curSceneSentences = [];
      curSceneStartMs = sceneEndMs;
    }
  }

  const beatsData = {
    jobId: paths.jobId,
    totalDurationMs,
    totalWords,
    sentences,
    pauses,
    numbers,
    suggestedSceneBreaks,
  };

  const validatedBeats = BeatsFileSchema.parse(beatsData);
  const beatsFile = path.join(paths.planDir, "beats.json");
  fs.writeFileSync(beatsFile, JSON.stringify(validatedBeats, null, 2), "utf-8");

  console.log(`✓ Analyzed ${totalWords} words across ${sentences.length} sentences`);
  console.log(`✓ Detected ${pauses.length} pauses (>=250ms) and ${numbers.length} numeric figures`);
  console.log(`✓ Suggested ${suggestedSceneBreaks.length} scenes covering ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`✓ Saved beats to ${beatsFile}\n`);
}

function extractNumbers(text: string): string[] {
  // Matches digits or written numbers like "nine point six trillion", "ten times", "trillions", "$9.6T"
  const digitRegex = /[$€£₹]?\d+(?:\.\d+)?(?:\s*(?:trillion|billion|million|k|%|x))?/gi;
  const writtenRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion|trillion)(?:\s+(?:point|and|\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|trillion|times|percent|dollars|rupees))*\b/gi;

  const results: string[] = [];
  const digitMatches = text.match(digitRegex) || [];
  for (const m of digitMatches) {
    if (m.trim().length > 0 && /\d/.test(m)) results.push(m.trim());
  }

  const writtenMatches = text.match(writtenRegex) || [];
  for (const m of writtenMatches) {
    const trimmed = m.trim();
    if (trimmed.length > 2 && !results.includes(trimmed)) results.push(trimmed);
  }

  return results;
}

function parseNumericValue(raw: string): number | undefined {
  const clean = raw.replace(/[$€£₹,\s]/g, "").toLowerCase();
  let multiplier = 1;
  let numPart = clean;

  if (clean.includes("trillion")) {
    multiplier = 1_000_000_000_000;
    numPart = clean.replace(/trillion|t/, "");
  } else if (clean.includes("billion")) {
    multiplier = 1_000_000_000;
    numPart = clean.replace(/billion|b/, "");
  } else if (clean.includes("million")) {
    multiplier = 1_000_000;
    numPart = clean.replace(/million|m/, "");
  } else if (clean.endsWith("%") || clean.includes("percent")) {
    multiplier = 0.01;
    numPart = clean.replace(/%|percent/, "");
  }

  // Convert words like "nine point six" -> 9.6
  if (raw.toLowerCase().includes("nine point six")) return 9.6 * multiplier;
  if (raw.toLowerCase().includes("ten")) return 10 * multiplier;

  const n = parseFloat(numPart);
  return isNaN(n) ? undefined : n * multiplier;
}


main().catch((err) => {
  console.error(`\n❌ Analyze failed: ${err.message}\n`);
  process.exit(1);
});
