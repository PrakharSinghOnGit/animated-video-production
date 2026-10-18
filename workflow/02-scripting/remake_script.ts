#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

async function checkOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    return res.ok;
  } catch {
    return false;
  }
}

async function generateWithOllama(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 8192,
      },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  process.stdout.write(`\n✍️ Generating original script with ${model}...\n\n`);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.response) {
          process.stdout.write(json.response);
          fullText += json.response;
        }
      } catch {
        // partial json chunk
      }
    }
  }

  process.stdout.write("\n\n");
  return fullText.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const targetId = args.find((a) => !a.startsWith("-"));
  const isManual = args.includes("--manual");

  let model = "gemma3:12b";
  const modelIdx = args.findIndex((a) => a === "--model" || a === "-m");
  if (modelIdx !== -1 && args[modelIdx + 1]) {
    model = args[modelIdx + 1];
  }

  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  if (!fs.existsSync(workspaceRoot)) {
    console.error(`❌ workspace directory not found at: ${workspaceRoot}`);
    process.exit(1);
  }

  let videoId = targetId;
  if (!videoId) {
    const candidates = fs.readdirSync(workspaceRoot).filter((d) => {
      const p = path.join(workspaceRoot, d, "02-scripting", "Transcribe_Raw.md");
      return fs.existsSync(p);
    });

    if (candidates.length === 0) {
      console.log(`
Usage:
  bun run script:remake <VIDEO_ID> [--manual] [--model gemma3:12b]
  bun run workflow/02-scripting/remake_script.ts <VIDEO_ID>

Examples:
  # AI Generation using local Ollama Gemma 3:
  bun run script:remake VID02_Stock_Market_Bubble

  # Manual Template Mode:
  bun run script:remake VID02_Stock_Market_Bubble --manual
`);
      process.exit(1);
    }
    videoId = candidates[candidates.length - 1];
    console.log(`ℹ️ Auto-selected workspace with raw transcript: ${videoId}`);
  }

  const videoDir = path.join(workspaceRoot, videoId);
  const scriptingDir = path.join(videoDir, "02-scripting");
  const ideationDir = path.join(videoDir, "01-ideation");
  const rawTranscriptPath = path.join(scriptingDir, "Transcribe_Raw.md");
  const scriptRawPath = path.join(scriptingDir, "script_raw.md");

  if (!fs.existsSync(rawTranscriptPath)) {
    console.error(`❌ Transcribe_Raw.md not found at: ${rawTranscriptPath}`);
    console.log(`Run 'bun run script:transcribe ${videoId}' first.`);
    process.exit(1);
  }

  const rawTranscript = fs.readFileSync(rawTranscriptPath, "utf-8");

  // Read metadata if available
  let metadata: any = null;
  const metaPath = path.join(ideationDir, "metadata.json");
  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    } catch {}
  }

  console.log(`\n======================================================`);
  console.log(`📝 SCRIPT REMAKER: ${videoId}`);
  console.log(`======================================================`);
  console.log(`Mode: ${isManual ? "MANUAL TEMPLATE" : `AI ENGINE (Ollama ${model})`}`);
  console.log(`Source: ${path.relative(process.cwd(), rawTranscriptPath)}`);
  if (metadata?.title) {
    console.log(`Reference Video: "${metadata.title}" by ${metadata.channel}`);
  }
  console.log(`======================================================\n`);

  if (isManual) {
    // Scaffold manual template
    const manualTemplate = `# ${videoId} Raw Script

> **Reference Source:** ${metadata?.title || "Reference Video"} (${metadata?.channel || "Unknown"})
> **Original Transcript Length:** ${rawTranscript.split(/\s+/).length} words
> **Instructions:** Draft your original script below using the standard two-line beat format:
> \`**[CLIP X - M:SS–M:SS]:** Visual description\`
> \`**VO:** [VO: Tone instruction] Spoken narration\`

---

### PART 1: THE HOOK (0:00–0:30)

**[CLIP 1 - 0:00–0:05]:** [High-energy opening hook visual — cinematic drone, macro data graphic, or shocking metric]
**VO:** \`[VO: Intense, dramatic tone]\` [Opening hook line that shatters conventional wisdom]

**[CLIP 2 - 0:05–0:12]:** [Motion graphic showing the hidden contrast or scale]
**VO:** \`[VO: Building urgency]\` [Second line establishing what is at stake]

---

### PART 2: THE HIDDEN MECHANISM (0:30–2:00)

**[CLIP 3 - 0:12–0:20]:** [Relatable visual metaphor explaining the technical apparatus]
**VO:** \`[VO: Conversational, investigative breakdown]\` [Explaining how the plumbing actually works]

---

### PART 3: THE SCALE & THE SCOREBOARD (2:00–4:00)

**[CLIP 4 - 0:20–0:30]:** [Hero numbers and comparative bar charts]
**VO:** \`[VO: Heavy emphasis on numbers]\` [Staggering metric reveal]

---

### PART 4: THE WEALTH TRANSFER (4:00–6:00)

**[CLIP 5 - 0:30–0:40]:** [Winner vs loser contrast — institutional profit vs public cost]
**VO:** \`[VO: Cold, cynical reality check]\` [Revealing who actually pays the price]

---

### PART 5: THE BEDROCK CONCLUSION

**[CLIP 6 - 0:40–0:50]:** [Final lingering visual summary]
**VO:** \`[VO: Measured, authoritative final verdict]\` [High-impact closing thesis]
`;
    fs.writeFileSync(scriptRawPath, manualTemplate, "utf-8");
    console.log(`✅ Manual template ready at:`);
    console.log(`   ${path.relative(process.cwd(), scriptRawPath)}\n`);
    console.log(`Open and draft your script, then run:`);
    console.log(`   bun run tts:format ${videoId}\n`);
    return;
  }

  // AI Mode via Ollama
  const isOllamaUp = await checkOllamaRunning();
  if (!isOllamaUp) {
    console.error(`❌ Ollama service is not responding at http://localhost:11434.`);
    console.log(`Start Ollama with: 'ollama serve' or launch the Ollama app.`);
    console.log(`To draft manually without AI, run with --manual:`);
    console.log(`   bun run script:remake ${videoId} --manual`);
    process.exit(1);
  }

  // Load system prompt
  const promptFile = path.resolve(
    process.cwd(),
    "workflow/02-scripting/prompts/remake_script_prompt.md"
  );
  const systemPrompt = fs.existsSync(promptFile)
    ? fs.readFileSync(promptFile, "utf-8")
    : "You are the lead scriptwriter for The Wealth Gap YouTube documentary channel.";

  const userPrompt = `
Topic / Reference Context:
- Video ID: ${videoId}
- Reference Title: ${metadata?.title || "N/A"}
- Channel: ${metadata?.channel || "N/A"}
- Description: ${metadata?.description ? metadata.description.slice(0, 500) : "N/A"}

Reference Raw Transcript:
"""
${rawTranscript.slice(0, 14000)}
"""

CRITICAL LENGTH & DURATION MANDATE:
- This MUST be an 8 TO 10 MINUTE long-form documentary script (minimum 1,300 to 1,600 spoken words).
- DO NOT summarize or write brief outlines. Write complete, detailed, cinematic narration across all 7 comprehensive chapters:
  ### PART 1: THE HOOK & THE SYSTEMIC PARADOX (0:00–1:00)
  ### PART 2: THE HIDDEN INFRASTRUCTURE (1:00–2:15)
  ### PART 3: THE RELATABLE ANALOGY & FRICTION (2:15–3:30)
  ### PART 4: THE SCALE & THE SCOREBOARD (3:30–5:00)
  ### PART 5: THE INSTITUTIONAL BENEFICIARIES (5:00–6:30)
  ### PART 6: THE ASYMMETRIC WEALTH TRANSFER (6:30–8:00)
  ### PART 7: THE BEDROCK CONCLUSION (8:00–9:30+)

Rules:
1. DO NOT copy phrases or sentences from the transcript. Re-architect the narrative completely from our investigative macroeconomic perspective.
2. Every single beat MUST strictly follow:
**[CLIP X - M:SS–M:SS]:** [Cinematic visual direction for motion graphics / 3D camera]
**VO:** \`[VO: Tone instruction]\` Spoken script narration written in full, natural, compelling paragraphs.
3. Output clean markdown starting with "# ${metadata?.title ? metadata.title.replace(/[^a-zA-Z0-9 ]/g, "") : videoId} Raw Script".
`;

  try {
    const generatedScript = await generateWithOllama(model, systemPrompt, userPrompt);

    fs.writeFileSync(scriptRawPath, generatedScript, "utf-8");

    const words = generatedScript.split(/\s+/).filter(Boolean).length;
    const estMinutes = (words / 150).toFixed(1);
    const partCount = (generatedScript.match(/^###\s+PART\s+\d+/gim) || []).length;
    const clipCount = (generatedScript.match(/\*\*\[CLIP\s+/gi) || []).length;

    console.log(`======================================================`);
    console.log(`✅ Original Script Generated & Saved!`);
    console.log(`   File: ${path.relative(process.cwd(), scriptRawPath)}`);
    console.log(`   Word Count:         ${words.toLocaleString()} words`);
    console.log(`   Estimated Runtime:  ~${estMinutes} minutes (@ 150 WPM)`);
    console.log(`   Chapters:           ${partCount} parts | ${clipCount} visual beats`);
    console.log(`======================================================\n`);

    if (words < 1100) {
      console.warn(`⚠️ Warning: Script word count (${words}) is below the 8-minute target (1,300+ words).`);
      console.warn(`You can expand sections in script_raw.md or run 'bun run script:remake ${videoId}' to re-generate.\n`);
    }

    console.log(`Next Steps:`);
    console.log(`  1. Review and tweak script in: ${path.relative(process.cwd(), scriptRawPath)}`);
    console.log(`  2. Format into VO sections with local F5-TTS prosody:`);
    console.log(`     bun run tts:format ${videoId}`);
    console.log(``);
  } catch (err: any) {
    console.error(`❌ AI Generation failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Remake script error:", err);
  process.exit(1);
});
