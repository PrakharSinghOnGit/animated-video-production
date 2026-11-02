/** Re-scan the voice sections for the dashboard (sections.json + long pauses): bun run voice:scan --video <ID> */
import fs from "node:fs";
import path from "node:path";
import { resolveWorkspace, loadSections } from "./src/workspace";
import { scanVoice, PAUSE_S } from "./src/scan";
import { DEFAULT_GEMINI_STYLE } from "./src/generate";

const argv = process.argv.slice(2);
const i = argv.indexOf("--video");
const ws = resolveWorkspace(i >= 0 ? argv[i + 1] : undefined);
let style = DEFAULT_GEMINI_STYLE;
try { style = JSON.parse(fs.readFileSync(path.join(ws.audioDir, "voice.json"), "utf-8")).style || style; } catch {}
const { flagged } = scanVoice(ws.audioDir, await loadSections(ws), style);
console.log(`✓ ${flagged} section(s) with a pause over ${PAUSE_S} s inside (03-voiceover/audio/pauses.json)`);
