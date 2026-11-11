/**
 * Idea bank: shared types and the store (workspace/_ideas/ideas.json). Imported by ideas.ts and the dashboard (no
 * side effects at import).
 */
import fs from "node:fs";
import path from "node:path";

export const REPO = path.resolve(import.meta.dir, "../..");
export const IDEAS_DIR = path.join(REPO, "workspace", "_ideas");
export const IDEAS_FILE = path.join(IDEAS_DIR, "ideas.json");
export const AUDIENCE_FILE = path.join(REPO, "workflow/01-ideation/AUDIENCE.md");

export interface Competitor {
  ytId: string; title: string; channel: string; channelId: string; publishedAt: string; durationS: number;
  views: number; channelSubs: number; channelAvgViews: number; ratio: number; thumb?: string; query: string;
  /** yt-viral: views ÷ the median of the channel's recent uploads of the same format (long or short); absent when
   *  fewer than 4 such uploads were found (then `ratio`, against the lifetime average, is all there is) */
  median?: number; multiple?: number; sampleN?: number;
  /** the title's hook formula (yt-script/hooks.json), a judgement about the words, not why it worked */
  formula?: string;
}
export interface Lint { score: number; chars: number; issues: [string, string][]; good: string[] }
export interface Verdict {
  verdict: "make" | "rework" | "drop"; summary: string;
  fit: { score: number; tests: { test: string; pass: boolean | null; note: string }[] };
  demand: { level: "high" | "medium" | "low" | "unclear"; evidence: string };
  overlap: { video: string; note: string }[]; angle: string;
  packages: { title: string; thumbnail: string; thumbText?: string; why: string; lint?: Lint }[];
  risks: string[]; sources: string[];
}
export interface Research {
  at: string; queries: string[]; competitors: Competitor[]; verdict: Verdict | null; model: string; costUsd: number; quotaUnits: number; error?: string;
  /** hook formulas among the outliers (multiple ≥ 2), most common first */
  formulas?: { formula: string; n: number }[];
}
export interface Idea {
  id: string; title: string; note: string; keywords: string;
  status: "new" | "researched" | "started" | "dropped";
  createdAt: string; ws?: string; research?: Research;
}
export interface IdeaStore { ideas: Idea[] }

export function readIdeas(): IdeaStore {
  try { return JSON.parse(fs.readFileSync(IDEAS_FILE, "utf-8")); } catch { return { ideas: [] }; }
}
export function writeIdeas(s: IdeaStore) {
  fs.mkdirSync(IDEAS_DIR, { recursive: true });
  const tmp = `${IDEAS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, IDEAS_FILE);
}
export const nextIdeaId = (s: IdeaStore) => `I${String(Math.max(0, ...s.ideas.map((i) => Number(i.id.slice(1)) || 0)) + 1).padStart(2, "0")}`;

/** The idea as the project's 02-scripting/idea.md: the creator's note plus the checked angle and packages. */
export function ideaMarkdown(i: Idea): string {
  const v = i.research?.verdict;
  return `# ${i.title}

${i.note.trim()}
${v ? `
## Angle (idea check, ${i.research!.at.slice(0, 10)})
${v.angle}

## Package candidates
${v.packages.map((p) => `- **${p.title}**: thumbnail: ${p.thumbnail}${p.thumbText ? ` (text: "${p.thumbText}")` : ""}${p.lint ? ` · title check ${p.lint.score}/100` : ""}`).join("\n")}

## Claims to source
${v.sources.map((s) => `- ${s}`).join("\n") || "- (none listed)"}
` : ""}`;
}
