import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { BeatsFileSchema, type Scene, type ScenesFile } from "../src/lib/schema";
import { parseBrief } from "../src/lib/frontMatter";
import { validateScenes } from "./validate-plan";

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npm run plan <job-id>");
    process.exit(1);
  }

  const paths = resolveJobPaths(target);
  console.log(`\n========================================`);
  console.log(`Planning Storyboard: ${paths.jobId}`);
  console.log(`========================================`);

  // Mode C: If storyboard.json is already provided in input/, use it directly
  const providedStoryboard = path.join(paths.inputDir, "storyboard.json");
  if (fs.existsSync(providedStoryboard)) {
    console.log(`Mode C: Found provided storyboard at ${providedStoryboard}`);
    const rawData = JSON.parse(fs.readFileSync(providedStoryboard, "utf-8"));
    const scenesPath = path.join(paths.outputDir, "scenes.json");
    fs.writeFileSync(scenesPath, JSON.stringify(rawData, null, 2), "utf-8");
    console.log(`✓ Copied storyboard to ${scenesPath}`);
    return;
  }

  // Mode A / B: Algorithmic Storyboard Generation from beats + brief
  const beatsPath = path.join(paths.planDir, "beats.json");
  if (!fs.existsSync(beatsPath)) {
    console.error(`ERROR: beats.json not found at ${beatsPath}. Run 'npm run analyze ${target}' first.`);
    process.exit(1);
  }

  const beats = BeatsFileSchema.parse(JSON.parse(fs.readFileSync(beatsPath, "utf-8")));
  const brief = parseBrief(fs.readFileSync(paths.briefFile!, "utf-8"));

  console.log(`Generating storyboard across ${beats.suggestedSceneBreaks.length} scenes...`);

  const scenes: Scene[] = [];

  for (let i = 0; i < beats.suggestedSceneBreaks.length; i++) {
    const brk = beats.suggestedSceneBreaks[i];
    const sentenceList = brk.sentenceIndices.map((idx) => beats.sentences[idx]);
    const voLine = sentenceList.map((s) => s.text).join(" ");
    const voLower = voLine.toLowerCase();

    // Determine visual grammar mapping based on Section 9.4
    let foreground: any[] = [];
    let intent = "";
    let metaphor = "";
    let chapter = brief.frontMatter.chapters?.[i] || `Scene 0${i + 1}`;
    let sourceTag: { text: string; dataRef?: string } | undefined = undefined;

    // Scene 1: Hook / Opener
    if (i === 0) {
      intent = "Deliver dramatic hook on invisible global currency flows";
      metaphor = "Cinematic title card with prologue badge";
      foreground = [
        {
          component: "TitleCard",
          props: {
            chapterBadge: "PROLOGUE",
            title: "The Invisible River of Global Liquidity",
            subtitle: "Every single day across London, New York, and Tokyo, money moves in secret.",
            accentColor: "#F5B83D",
          },
        },
      ];
    }
    // Scene 2: Big Number ($9.6 Trillion)
    else if (voLower.includes("nine point six") || voLower.includes("trillion") || voLower.includes("9.6")) {
      intent = "Visceral magnitude of daily FX volume";
      metaphor = "Massive animated numeral counting up to $9.6 Trillion";
      foreground = [
        {
          component: "BigNumber",
          props: {
            value: 9.6,
            prefix: "$",
            suffix: "TRILLION",
            decimals: 1,
            label: "Traded across currency markets every single day",
            sublabel: "Global foreign exchange daily turnover",
            accentColor: "#F5B83D",
          },
          anchors: [
            {
              word: "trillion",
              occurrence: 1,
              action: "countUp.end",
              offsetFrames: -8,
            },
          ],
        },
      ];
      sourceTag = {
        text: "Bank for International Settlements (BIS) Triennial Survey 2025",
        dataRef: "brief.must_show[0]",
      };
    }
    // Scene 3: Comparison (10x vs Stock Market)
    else if (voLower.includes("ten times") || voLower.includes("stock market") || voLower.includes("bigger")) {
      intent = "Visually contrast FX volume against all stock markets";
      metaphor = "Proportional scale spheres demonstrating the 10x multiple";
      foreground = [
        {
          component: "SizeCompare",
          props: {
            title: "Scale Comparison: Daily Trading Volume",
            subtitle: "Area corresponds directly to dollar turnover",
            items: [
              {
                label: "Foreign Exchange Market",
                value: 9.6,
                displayValue: "$9.6T",
                color: "#F5B83D",
                subtext: "10× larger daily volume",
              },
              {
                label: "Global Stock Markets",
                value: 0.95,
                displayValue: "$0.95T",
                color: "#2EC4B6",
                subtext: "All worldwide exchanges combined",
              },
            ],
          },
        },
      ];
      sourceTag = {
        text: "World Federation of Exchanges (WFE) / BIS Comparison",
        dataRef: "brief.must_show[1]",
      };
    }
    // Scene 4: Interbank Transfer / Money Flow
    else if (voLower.includes("commercial banks") || voLower.includes("transfer") || voLower.includes("borders")) {
      intent = "Show how interbank reserve transfers clear across global corridors";
      metaphor = "Three-node bank network with high-speed liquidity particles";
      foreground = [
        {
          component: "MoneyFlow",
          props: {
            title: "Cross-Border Liquidity Transfer",
            subtitle: "How trillions settle across commercial banking corridors in seconds",
            flowColor: "#F5B83D",
            nodes: [
              {
                id: "ny-bank",
                label: "New York Commercial",
                subtext: "Fedwire Reserve",
                color: "#2EC4B6",
              },
              {
                id: "cls-hub",
                label: "CLS Settlement Hub",
                subtext: "Continuous Linked Settlement",
                color: "#F5B83D",
              },
              {
                id: "london-bank",
                label: "London Dealer Hub",
                subtext: "CHAPS Settlement",
                color: "#2EC4B6",
              },
            ],
            transfers: [
              {
                fromId: "ny-bank",
                toId: "cls-hub",
                amountLabel: "$4.2 Trillion",
              },
              {
                fromId: "cls-hub",
                toId: "london-bank",
                amountLabel: "£3.1 Trillion",
              },
            ],
          },
        },
      ];
    }
    // Scene 5: Financial Architecture / Outro
    else {
      intent = "Explain the shadow architecture shaping global wealth disparity";
      metaphor = "Definition card with rough-notation underline";
      foreground = [
        {
          component: "TermCard",
          props: {
            category: "MARKET ARCHITECTURE",
            term: "The Shadow Currency Engine",
            definition: "The private interbank settlement network that invisibly dictates global liquidity and asset prices.",
            highlightWord: "invisibly dictates",
            accentColor: "#F5B83D",
          },
        },
      ];
    }

    scenes.push({
      id: brk.sceneId,
      chapter,
      startMs: brk.startMs,
      endMs: brk.endMs,
      voLine,
      intent,
      visualMetaphor: metaphor,
      layers: {
        background: {
          component: "GridDrift",
          props: { intensity: 0.8 },
        },
        midground: {
          component: "GlowBlobs",
          props: { hue: i % 2 === 0 ? "accent" : "accent2", intensity: 0.22 },
        },
        foreground,
      },
      sourceTag,
      transitionOut: {
        type: i === beats.suggestedSceneBreaks.length - 1 ? "none" : "wipe",
        durationFrames: 10,
      },
      sfx: [
        {
          at: "scene.start",
          sound: "whoosh",
          volume: 0.2,
        },
      ],
    });
  }

  const storyboardData: ScenesFile = {
    jobId: paths.jobId,
    fps: 30,
    totalDurationMs: beats.totalDurationMs + 1200,
    scenes,
  };

  const scenesPath = path.join(paths.outputDir, "scenes.json");
  fs.writeFileSync(scenesPath, JSON.stringify(storyboardData, null, 2), "utf-8");
  console.log(`✓ Storyboard scenes saved to ${scenesPath}`);

  // Validate the generated plan immediately
  const captionsRaw = JSON.parse(fs.readFileSync(path.join(paths.outputDir, "captions.json"), "utf-8"));
  const { isValid, issues } = validateScenes(storyboardData, captionsRaw);

  if (!isValid) {
    console.error("❌ Generated storyboard failed validation:");
    for (const issue of issues) {
      console.error(`  - [${issue.sceneId || "general"}] ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`✓ Storyboard validated successfully with 0 errors!`);
}

main().catch((err) => {
  console.error(`Planning failed: ${err.message}`);
  process.exit(1);
});
