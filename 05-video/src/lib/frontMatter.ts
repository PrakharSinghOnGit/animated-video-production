import { parse as parseYaml } from "yaml";
import { BriefFrontMatterSchema, type BriefFrontMatter } from "./schema";

export interface ParsedBrief {
  frontMatter: BriefFrontMatter;
  body: string;
}

/**
 * Extracts and validates YAML front-matter from a markdown brief.
 */
export function parseBrief(content: string): ParsedBrief {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid brief.md: Missing YAML front-matter enclosed between '---' delimiters.");
  }

  const rawYaml = match[1];
  const body = match[2].trim();

  let parsed: unknown;
  try {
    parsed = parseYaml(rawYaml);
  } catch (err: any) {
    throw new Error(`YAML syntax error in brief.md front-matter: ${err.message}`);
  }

  const validation = BriefFrontMatterSchema.safeParse(parsed);
  if (!validation.success) {
    const errorDetails = validation.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Validation error in brief.md front-matter:\n${errorDetails}`);
  }

  return {
    frontMatter: validation.data,
    body,
  };
}
