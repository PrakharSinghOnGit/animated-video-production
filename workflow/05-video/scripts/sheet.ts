import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  console.log("\n========================================");
  console.log("Generating Visual Contact Sheet");
  console.log("========================================");

  const componentsDir = path.resolve(process.cwd(), "out", "components");
  if (!fs.existsSync(componentsDir)) {
    console.error(`ERROR: No stills found at ${componentsDir}. Render component stills first.`);
    process.exit(1);
  }

  const imageFiles = fs
    .readdirSync(componentsDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => path.join(componentsDir, f));

  if (imageFiles.length === 0) {
    console.error("ERROR: No .png files found in out/components/.");
    process.exit(1);
  }

  const outputFile = path.resolve(process.cwd(), "out", "contact-sheet.png");
  console.log(`Tiling ${imageFiles.length} frames into contact sheet...`);

  // Build ffmpeg inputs and tile filter
  const inputArgs: string[] = [];
  const filterInputs: string[] = [];

  imageFiles.forEach((file, index) => {
    inputArgs.push("-i", file);
    filterInputs.push(`[${index}:v]scale=640:360[v${index}]`);
  });

  const cols = 3;
  const vList = imageFiles.map((_, i) => `[v${i}]`).join("");
  const filterComplex = `${filterInputs.join(";")};${vList}xstack=inputs=${imageFiles.length}:layout=${generateLayout(
    imageFiles.length,
    cols,
    640,
    360
  )}[out]`;

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      outputFile,
    ]);
    console.log(`✓ Contact sheet generated at ${outputFile}`);
  } catch (err: any) {
    console.warn(`ffmpeg xstack warning (${err.message}). Trying fallback tile filter...`);
    // Fallback: create concat or simple tile
    try {
      const tileCols = Math.min(cols, imageFiles.length);
      const tileRows = Math.ceil(imageFiles.length / tileCols);
      await execFileAsync("ffmpeg", [
        "-y",
        "-pattern_type",
        "glob",
        "-i",
        path.join(componentsDir, "*.png"),
        "-filter_complex",
        `scale=640:360,tile=${tileCols}x${tileRows}`,
        outputFile,
      ]);
      console.log(`✓ Contact sheet generated with fallback at ${outputFile}`);
    } catch (err2: any) {
      console.error(`Failed to generate contact sheet: ${err2.message}`);
    }
  }
}

function generateLayout(total: number, cols: number, w: number, h: number): string {
  const layouts: string[] = [];
  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col === 0 ? "0" : `w0*${col}`;
    const y = row === 0 ? "0" : `h0*${row}`;
    layouts.push(`${x}_${y}`);
  }
  return layouts.join("|");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
