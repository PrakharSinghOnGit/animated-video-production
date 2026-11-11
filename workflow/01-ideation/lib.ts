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
}
export interface Verdict {
  verdict: "make" | "rework" | "drop"; summary: string;
  fit: { score: number; tests: { test: string; pass: boolean | null; note: string }[] };
  demand: { level: "high" | "medium" | "low" | "unclear"; evidence: string };
  overlap: { video: string; note: string }[]; angle: string;
  packages: { title: string; thumbnail: string; why: string }[];
  risks: string[]; sources: string[];
}
export interface Research { at: string; queries: string[]; competitors: Competitor[]; verdict: Verdict | null; model: string; costUsd: number; quotaUnits: number; error?: string }
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
${v.packages.map((p) => `- **${p.title}**: thumbnail: ${p.thumbnail}`).join("\n")}

## Claims to source
${v.sources.map((s) => `- ${s}`).join("\n") || "- (none listed)"}
` : ""}`;
}
