/**
 * Generate a music bed with Stable Audio (Stability AI developer API) and add it to the library (assets/music/index.json).
 *
 *   bun run music:gen --prompt <id>            a prompt from workflow/06-audio/music_prompts.json
 *   bun run music:gen --text "..." --mood calm,curious [--energy 0.3] [--bpm 90]
 *   options: --seconds 180 (1-380) --seed N --list (print the prompt ids)
 *
 * Needs STABILITY_API_KEY in .env (platform.stability.ai: separate from the stableaudio.com web app and its credits).
 * Cost: 8 credits ($0.08) per successful generation; failed ones are free. Output: assets/music/generated/<id>-<seed>.mp3.
 * Check Stability's terms for commercial use of outputs before publishing.
 */
import fs from "node:fs";
import path from "node:path";
import { MUSIC_DIR, measure, readLibrary, writeLibrary } from "./music_lib";
import { REPO_ROOT } from "./py";

const a = process.argv.slice(2);
const opt = (n: string) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
const lib = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "music_prompts.json"), "utf-8")) as {
  common: string; prompts: { id: string; style: string; mood: string[]; energy: number; bpm: number; seconds: number; prompt: string }[];
};

if (a.includes("--list")) {
  for (const p of lib.prompts) console.log(`${p.id.padEnd(24)} ${p.style.padEnd(9)} ${p.mood.join(",").padEnd(20)} ${p.bpm} BPM · ${p.seconds} s`);
  process.exit(0);
}
const pid = opt("--prompt"), text = opt("--text");
const preset = pid ? lib.prompts.find((p) => p.id === pid) : undefined;
if (pid && !preset) { console.error(`[music:gen] unknown prompt "${pid}" (--list shows them)`); process.exit(1); }
if (!preset && !text) { console.error("[music:gen] give --prompt <id> or --text \"...\" (--list shows the prompts)"); process.exit(1); }
const key = process.env.STABILITY_API_KEY;
if (!key) { console.error("[music:gen] STABILITY_API_KEY is not set: create a key at platform.stability.ai and add it to .env"); process.exit(1); }

const seconds = Math.max(1, Math.min(380, Number(opt("--seconds") ?? preset?.seconds ?? 180)));
const seed = Number(opt("--seed") ?? Math.floor(Math.random() * 4e9) + 1);
const prompt = `${preset?.prompt ?? text} ${lib.common}`;
const id = preset?.id ?? (opt("--name") ?? "custom").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();

const H = { Authorization: `Bearer ${key}`, Accept: "audio/*", "stability-client-id": "wealthgap" };
const form = new FormData();
form.set("prompt", prompt); form.set("duration", String(seconds)); form.set("seed", String(seed)); form.set("output_format", "mp3");
console.log(`[music:gen] ${id}: ${seconds} s, seed ${seed} (8 credits)`);
const sub = await fetch("https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio", { method: "POST", headers: H, body: form });
const fail = async (r: Response, what: string) => {
  const why: Record<number, string> = { 400: "bad parameters", 401: "key rejected", 402: "out of credits", 403: "flagged by moderation (not charged)", 422: "rejected (copyrighted or non-English content)", 429: "rate limited" };
  console.error(`[music:gen] ${what} HTTP ${r.status}${why[r.status] ? ` (${why[r.status]})` : ""}: ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
};
let audio: ArrayBuffer;
if (sub.status === 200) audio = await sub.arrayBuffer();
else if (sub.status === 202) {
  const { id: gen } = (await sub.json()) as { id: string };
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await fetch(`https://api.stability.ai/v2beta/audio/results/${gen}`, { headers: H });
    if (r.status === 202) { if (i % 6 === 5) console.log("[music:gen] still generating…"); if (i > 120) { console.error("[music:gen] gave up after 10 min"); process.exit(1); } continue; }
    if (!r.ok) await fail(r, "result");
    audio = await r.arrayBuffer(); break;
  }
} else await fail(sub, "submit");

const rel = path.join("assets/music/generated", `${id}-${seed}.mp3`);
fs.mkdirSync(path.join(MUSIC_DIR, "generated"), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, rel), Buffer.from(audio!));
const m = measure([rel])[rel];
const L = readLibrary();
L.tracks = L.tracks.filter((t) => t.file !== rel);
L.tracks.push({
  file: rel, title: `${id} (seed ${seed})`, mood: preset?.mood ?? (opt("--mood")?.split(",") ?? ["untagged"]),
  bpm: m && !("error" in m) ? m.bpm : preset?.bpm ?? null, energy: preset?.energy ?? (opt("--energy") ? Number(opt("--energy")) : m && !("error" in m) ? m.energy : null),
  duration: m && !("error" in m) ? m.duration : seconds, source: "stable-audio", license: "Stability AI platform terms", prompt, seed,
  added: new Date().toISOString().slice(0, 10),
});
L.tracks.sort((x, y) => x.file.localeCompare(y.file));
writeLibrary(L);
console.log(`[music:gen] saved ${rel} and added it to the library. Listen before you use it.`);
