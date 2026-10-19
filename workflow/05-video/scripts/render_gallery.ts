import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const outputDir = "/tmp/gallery_stills";
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const slides = [
  { id: 0, name: "primitives", frame: 15 },
  { id: 1, name: "objects_3d", frame: 45 },
  { id: 2, name: "labels_ripples", frame: 75 },
  { id: 3, name: "counters_stress", frame: 105 },
  { id: 4, name: "charts_bignumber_bar", frame: 135 },
  { id: 5, name: "charts_line_size", frame: 165 },
  { id: 6, name: "charts_grid_flow", frame: 195 },
  { id: 7, name: "editorial_cards", frame: 225 },
  { id: 8, name: "geography_globe3d", frame: 255 },
];

console.log("=== Rendering Gallery Stills (9 Slides) ===");
const times: { name: string; timeMs: number }[] = [];

for (const slide of slides) {
  const outFile = path.join(outputDir, `slide_${slide.id}.png`);
  const t0 = performance.now();
  console.log(`Rendering Slide ${slide.id + 1}/9: ${slide.name} (frame ${slide.frame})...`);
  
  execSync(
    `bunx remotion still workflow/05-video/src/index.ts Gallery ${outFile} --frame ${slide.frame} --log=warn`,
    { stdio: "inherit" }
  );
  
  const elapsed = Math.round(performance.now() - t0);
  times.push({ name: slide.name, timeMs: elapsed });
  console.log(`  -> Finished in ${elapsed}ms`);
}

console.log("\n=== Render Performance Summary ===");
times.forEach((t) => {
  console.log(`- ${t.name.padEnd(25)}: ${t.timeMs}ms`);
});
