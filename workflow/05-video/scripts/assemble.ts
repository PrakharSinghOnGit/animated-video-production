import fs from "node:fs";
import path from "node:path";
import { resolveJobPaths } from "../src/lib/workspaceBridge";
import { buildTimeline } from "../src/lib/timelineBuilder";

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
  console.log(`Assembling Video Scenes for: ${paths.jobId}`);
  console.log(`========================================`);

  // 1. Build / verify timeline
  const captionsFile = path.join(paths.outputDir, "captions.json");
  const storyboardFile = path.join(paths.outputDir, "storyboard.json");

  if (!fs.existsSync(captionsFile)) {
    console.error(`❌ Error: Missing captions.json. Run "bun run captions --video <ID>" first.`);
    process.exit(1);
  }
  if (!fs.existsSync(storyboardFile)) {
    console.error(`❌ Error: Missing storyboard.json. Run "bun run storyboard" first.`);
    process.exit(1);
  }

  const captions = JSON.parse(fs.readFileSync(captionsFile, "utf-8"));
  const storyboard = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));

  let fps = 30;
  if (paths.configFile && fs.existsSync(paths.configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(paths.configFile, "utf-8"));
      if (cfg.fps) fps = cfg.fps;
    } catch {}
  }

  const timeline = buildTimeline(captions, storyboard, { fps, leadMs: 200 });
  fs.writeFileSync(path.join(paths.outputDir, "timeline.json"), JSON.stringify(timeline, null, 2), "utf-8");

  // 1b. Ensure workspace has Remotion template structure (Root.tsx, Main.tsx, index.ts, configs)
  const templateDir = path.resolve(process.cwd(), "workflow/05-video/template");
  if (fs.existsSync(templateDir)) {
    const srcDir = path.join(paths.outputDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });

    // Root.tsx
    const rootFile = path.join(srcDir, "Root.tsx");
    if (!fs.existsSync(rootFile)) {
      fs.copyFileSync(path.join(templateDir, "src", "Root.tsx"), rootFile);
      console.log(`✓ Scaffolding Root.tsx in ${srcDir}`);
    }

    // Main.tsx
    const mainFile = path.join(srcDir, "Main.tsx");
    if (!fs.existsSync(mainFile)) {
      fs.copyFileSync(path.join(templateDir, "src", "Main.tsx"), mainFile);
      console.log(`✓ Scaffolding Main.tsx in ${srcDir}`);
    }

    // index.ts (must call registerRoot)
    const indexFile = path.join(srcDir, "index.ts");
    let needsIndexScaffold = !fs.existsSync(indexFile);
    if (fs.existsSync(indexFile)) {
      const idxContent = fs.readFileSync(indexFile, "utf-8");
      if (!idxContent.includes("registerRoot")) {
        needsIndexScaffold = true;
      }
    }
    if (needsIndexScaffold) {
      fs.copyFileSync(path.join(templateDir, "src", "index.ts"), indexFile);
      console.log(`✓ Scaffolding registerRoot entry point: ${indexFile}`);
    }

    // Config files
    const configFiles = ["remotion.config.ts", "tsconfig.json"];
    for (const cf of configFiles) {
      const dest = path.join(paths.outputDir, cf);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(templateDir, cf), dest);
      }
    }

    // package.json & bun install linking
    const pkgFile = path.join(paths.outputDir, "package.json");
    if (!fs.existsSync(pkgFile)) {
      const templatePkg = fs.readFileSync(path.join(templateDir, "package.json"), "utf-8");
      const pkgSlug = paths.jobId.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      fs.writeFileSync(pkgFile, templatePkg.replace("{{VIDEO_ID}}", pkgSlug), "utf-8");
      try {
        const { execSync } = require("node:child_process");
        execSync("bun install", { stdio: "ignore" });
      } catch {}
    }

    // public directory & master audio sync
    const publicDir = path.join(paths.outputDir, "public");
    fs.mkdirSync(publicDir, { recursive: true });
    if (paths.audioFile && fs.existsSync(paths.audioFile)) {
      const publicVo = path.join(publicDir, "voiceover.wav");
      const masterSize = fs.statSync(paths.audioFile).size;
      const publicSize = fs.existsSync(publicVo) ? fs.statSync(publicVo).size : 0;
      if (publicSize !== masterSize) {
        fs.copyFileSync(paths.audioFile, publicVo);
      }
    }
  }

  // 2. Discover scene files in src/scenes/
  const scenesDir = path.join(paths.outputDir, "src", "scenes");
  fs.mkdirSync(scenesDir, { recursive: true });

  const existingFiles = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".tsx") && f !== "index.ts");

  const registryImports: string[] = [];
  const registryArrayEntries: string[] = [];
  const registryEntries: string[] = [];
  const metaEntries: string[] = [];
  const allSfx: any[] = [];
  const allNumbers: any[] = [];

  for (const scene of timeline.scenes) {
    const matchingFile = existingFiles.find((f) => {
      const idMatch = f.match(/^([SA]\d+)/i);
      return idMatch && idMatch[1].toUpperCase() === scene.id.toUpperCase();
    });

    if (matchingFile) {
      const importName = `${scene.id}Component`;
      const metaName = `${scene.id}Meta`;
      const relPath = `./${matchingFile.replace(/\.tsx$/, "")}`;

      registryImports.push(`import ${importName}, { meta as ${metaName} } from "${relPath}";`);
      registryArrayEntries.push(
        `  { id: "${scene.id}", slug: "${scene.slug}", component: ${importName}, meta: ${metaName} },`
      );
      registryEntries.push(`  "${scene.id}": ${importName},`);
      metaEntries.push(`  "${scene.id}": ${metaName},`);

      // Read file content to parse meta statically
      try {
        const content = fs.readFileSync(path.join(scenesDir, matchingFile), "utf-8");
        // Check SFX
        const sounds = content.match(/sound:\s*["']([^"']+)["']/g);
        if (sounds) {
          sounds.forEach((snd) => {
            allSfx.push({
              sceneId: scene.id,
              sound: snd.replace(/^sound:\s*["']/, "").replace(/["']$/, ""),
            });
          });
        }
      } catch {}
    } else {
      // Scene file does not exist yet: provide placeholder
      registryArrayEntries.push(
        `  { id: "${scene.id}", slug: "${scene.slug}", component: () => React.createElement(PlaceholderScene, { id: "${scene.id}", slug: "${scene.slug}" }), meta: { id: "${scene.id}", title: "${scene.slug}" } },`
      );
      registryEntries.push(
        `  "${scene.id}": () => React.createElement(PlaceholderScene, { id: "${scene.id}", slug: "${scene.slug}" }),`
      );
      metaEntries.push(`  "${scene.id}": { id: "${scene.id}", title: "${scene.slug}" },`);
    }
  }

  // 3. Collect storyboard SFX and numbers
  for (const s of storyboard.scenes) {
    if (s.sfx) {
      for (const cue of s.sfx) {
        allSfx.push({ sceneId: s.id, ...cue });
      }
    }
    if (s.data) {
      for (const d of s.data) {
        allNumbers.push({ sceneId: s.id, ...d });
      }
    }
  }

  // 4. Generate src/scenes/index.ts
  const indexContent = `/**
 * Auto-generated scene registry for ${paths.jobId}
 * Generated by "bun run assemble"
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { tokens } from "@wealthgap/kit";

${registryImports.join("\n")}

const PlaceholderScene: React.FC<{ id: string; slug: string }> = ({ id, slug }) =>
  React.createElement(
    AbsoluteFill,
    {
      style: {
        backgroundColor: tokens.color.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tokens.color.muted,
        fontFamily: tokens.font.mono,
      },
    },
    React.createElement(
      "div",
      {
        style: {
          border: "1px dashed rgba(255,255,255,0.15)",
          borderRadius: 16,
          padding: "30px 50px",
          textAlign: "center",
        },
      },
      React.createElement(
        "div",
        { style: { fontSize: 44, fontWeight: 800, color: tokens.color.accent } },
        id
      ),
      React.createElement(
        "div",
        { style: { fontSize: 24, marginTop: 8 } },
        \`\${slug} (Placeholder)\`
      )
    )
  );

export interface SceneRegistryEntry {
  id: string;
  slug: string;
  component: React.ComponentType<any>;
  meta: any;
}

export const SCENE_REGISTRY: SceneRegistryEntry[] = [
${registryArrayEntries.join("\n")}
];

export const sceneRegistry: Record<string, React.ComponentType> = {
${registryEntries.join("\n")}
};

export const sceneMetaRegistry: Record<string, any> = {
${metaEntries.join("\n")}
};
`;

  const indexPath = path.join(scenesDir, "index.ts");
  fs.writeFileSync(indexPath, indexContent, "utf-8");
  console.log(`✓ Generated scene registry: ${indexPath} (${timeline.scenes.length} scenes)`);

  // 5. Write SFX cues
  const sfxPath = path.join(paths.outputDir, "sfx_cues.json");
  fs.writeFileSync(sfxPath, JSON.stringify(allSfx, null, 2), "utf-8");
  console.log(`✓ Wrote SFX cues to: ${sfxPath} (${allSfx.length} cues)`);

  // 6. Write sources.md
  let sourcesMd = `# Sources & Citations: ${paths.jobId}\n\n`;
  sourcesMd += `| Scene | Metric / Value | Description | Official Source |\n`;
  sourcesMd += `|---|---|---|---|\n`;
  for (const n of allNumbers) {
    sourcesMd += `| **${n.sceneId}** | \`${n.value}\` | ${n.label} | ${n.source} |\n`;
  }
  const sourcesPath = path.join(paths.outputDir, "sources.md");
  fs.writeFileSync(sourcesPath, sourcesMd, "utf-8");
  console.log(`✓ Wrote sources report to: ${sourcesPath} (${allNumbers.length} citations)`);
}

main().catch((err) => {
  console.error(`\n❌ Assemble failed: ${err.message}\n`);
  process.exit(1);
});
