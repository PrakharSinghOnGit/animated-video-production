import { z } from "zod";
import { ALLOWED_SFX } from "@wealthgap/kit";

export const ALLOWED_PALETTE_TOKENS = [
  "lav",
  "mint",
  "peach",
  "sky",
  "butter",
  "rose",
  "accent",
  "accent2",
  "positive",
  "negative",
] as const;

export const BeatSchema = z.object({
  anchor: z.string().min(1, "Anchor word cannot be empty"),
  occurrence: z.number().int().min(1).default(1),
  offsetMs: z.number().default(0),
  action: z.string().min(1, "Beat action description required"),
});

export const SfxCueSchema = z.object({
  anchor: z.string().min(1),
  occurrence: z.number().int().min(1).default(1),
  sound: z.string().min(1),
  volume: z.number().min(0).max(1).default(0.2),
  offsetMs: z.number().default(0),
});

export const StoryboardDataPointSchema = z.object({
  value: z.string().min(1, "Data value required"),
  label: z.string().min(1, "Data label required"),
  source: z.string().min(1, "Every data figure must have a source citation"),
});

export const StoryboardSceneSchema = z.object({
  id: z.string().regex(/^S\d+$/i, "Scene id must match S01, S02, etc."),
  slug: z.string().min(1, "Slug is required"),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  vo: z.string().default(""),
  claim: z.string().default(""),
  relationship: z.string().default(""),
  metaphor: z.string().min(1, "Visual metaphor is required"),
  hero: z.string().min(1, "Hero moment description is required"),
  layout: z.string().default(""),
  camera: z.string().default(""),
  beats: z.array(BeatSchema).default([]),
  palette: z.array(z.string()).default([]),
  data: z.array(StoryboardDataPointSchema).default([]),
  needsData: z.array(z.any()).default([]),
  sfx: z.array(SfxCueSchema).default([]),
  handoff: z.union([z.string(), z.null()]).optional(),
  transitionOut: z.record(z.string(), z.any()).optional(),
  techNotes: z.string().optional(),
});

export const StoryboardSchema = z.object({
  schemaVersion: z.number().default(1),
  video: z.object({
    id: z.string(),
    title: z.string().optional(),
    language: z.string().default("en"),
  }),
  videoArc: z
    .object({
      summary: z.string().optional(),
      motifs: z.array(z.any()).optional(),
      palettePlan: z.record(z.string(), z.any()).optional(),
      energyPlan: z.string().optional(),
    })
    .optional(),
  scenes: z.array(StoryboardSceneSchema).min(1, "Storyboard must contain at least one scene"),
  warnings: z.array(z.string()).default([]),
});

export type StoryboardData = z.infer<typeof StoryboardSchema>;
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  sceneId?: string;
  message: string;
}

export interface StoryboardValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  storyboard?: StoryboardData;
}

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function validateStoryboard(
  rawInput: unknown,
  captions: Array<{ text: string; startMs: number; endMs: number }> = []
): StoryboardValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Zod parse
  const parseResult = StoryboardSchema.safeParse(rawInput);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        severity: "error",
        code: "SCHEMA_VALIDATION_ERROR",
        message: `${issue.path.join(".")}: ${issue.message}`,
      });
    }
    return { valid: false, errors, warnings };
  }

  const sb = parseResult.data;
  const scenes = sb.scenes;

  // 2. Timeline Tiling & Durations
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const durMs = s.endMs - s.startMs;

    // Check duration 3s to 12s
    if (durMs < 2900) {
      errors.push({
        severity: "error",
        code: "SCENE_TOO_SHORT",
        sceneId: s.id,
        message: `Scene ${s.id} duration (${(durMs / 1000).toFixed(2)}s) is shorter than 3 seconds minimum.`,
      });
    } else if (durMs > 12500) {
      warnings.push({
        severity: "warning",
        code: "SCENE_LONG",
        sceneId: s.id,
        message: `Scene ${s.id} duration (${(durMs / 1000).toFixed(2)}s) exceeds standard 12s maximum. Ensure visual world stays active.`,
      });
    }

    // Check seamless tiling with next scene
    if (i < scenes.length - 1) {
      const next = scenes[i + 1];
      const gap = next.startMs - s.endMs;
      if (Math.abs(gap) > 250) {
        errors.push({
          severity: "error",
          code: "TIMELINE_GAP_OR_OVERLAP",
          sceneId: s.id,
          message: `Gap/overlap of ${gap}ms detected between scene ${s.id} (ends ${s.endMs}ms) and ${next.id} (starts ${next.startMs}ms). Scenes must tile seamlessly.`,
        });
      }
    }

    // 3. Palette Validation
    if (s.palette) {
      for (const col of s.palette) {
        if (!ALLOWED_PALETTE_TOKENS.includes(col as any)) {
          errors.push({
            severity: "error",
            code: "INVALID_PALETTE_TOKEN",
            sceneId: s.id,
            message: `Color token "${col}" in scene ${s.id} is invalid. Allowed: ${ALLOWED_PALETTE_TOKENS.join(", ")}.`,
          });
        }
      }
    }

    // 4. SFX Sound Names
    for (const cue of s.sfx) {
      if (!ALLOWED_SFX.includes(cue.sound.toLowerCase())) {
        errors.push({
          severity: "error",
          code: "INVALID_SFX_SOUND",
          sceneId: s.id,
          message: `SFX sound "${cue.sound}" in scene ${s.id} not in allowed set: ${ALLOWED_SFX.join(", ")}.`,
        });
      }
    }

    // 5. Banned Motion Wording
    const bannedRegex = /\b(fades?\s+in|fades?\s+out|slides?\s+in|slides?\s+out)\b/i;
    if (bannedRegex.test(s.metaphor)) {
      errors.push({
        severity: "error",
        code: "BANNED_MOTION_WORDING",
        sceneId: s.id,
        message: `Scene ${s.id} metaphor uses banned generic motion ("fades in" / "slides in"). Describe masked reveals, morphs, or spawns.`,
      });
    }
    if (bannedRegex.test(s.hero)) {
      errors.push({
        severity: "error",
        code: "BANNED_MOTION_WORDING",
        sceneId: s.id,
        message: `Scene ${s.id} hero moment uses banned generic motion.`,
      });
    }
    for (const beat of s.beats) {
      if (bannedRegex.test(beat.action)) {
        errors.push({
          severity: "error",
          code: "BANNED_MOTION_WORDING",
          sceneId: s.id,
          message: `Beat action "${beat.action}" uses banned generic motion.`,
        });
      }
    }

    // 6. Anchor Word Verification (against scene captions if available, or vo)
    const sceneWords =
      captions.length > 0
        ? captions
            .filter((c) => (c.startMs + c.endMs) / 2 >= s.startMs - 50 && (c.startMs + c.endMs) / 2 <= s.endMs + 50)
            .map((c) => cleanWord(c.text))
        : s.vo.split(/\s+/).map(cleanWord);

    const checkAnchor = (anchor: string, occ: number, label: string) => {
      const cleanA = cleanWord(anchor);
      const matches = sceneWords.filter((w) => w === cleanA);
      if (matches.length === 0) {
        errors.push({
          severity: "error",
          code: "MISSING_ANCHOR_WORD",
          sceneId: s.id,
          message: `Scene ${s.id} ${label} anchor word "${anchor}" does not exist in spoken narration.`,
        });
      } else if (occ > matches.length) {
        errors.push({
          severity: "error",
          code: "INVALID_ANCHOR_OCCURRENCE",
          sceneId: s.id,
          message: `Scene ${s.id} ${label} anchor word "${anchor}" has occurrence ${occ}, but only appears ${matches.length} time(s).`,
        });
      }
    };

    for (const b of s.beats) {
      checkAnchor(b.anchor, b.occurrence, "beat");
    }
    for (const cue of s.sfx) {
      checkAnchor(cue.anchor, cue.occurrence, "sfx");
    }

    // 7. Consecutive Duplicate Check
    if (i > 0) {
      const prev = scenes[i - 1];
      if (s.relationship && prev.relationship && s.relationship.trim().toLowerCase() === prev.relationship.trim().toLowerCase()) {
        warnings.push({
          severity: "warning",
          code: "CONSECUTIVE_DUPLICATE_RELATIONSHIP",
          sceneId: s.id,
          message: `Consecutive scenes ${prev.id} and ${s.id} share the same relationship ("${s.relationship}"). Vary the visual metaphor.`,
        });
      }
      if (s.layout && prev.layout && s.layout.trim().toLowerCase() === prev.layout.trim().toLowerCase()) {
        warnings.push({
          severity: "warning",
          code: "CONSECUTIVE_DUPLICATE_LAYOUT",
          sceneId: s.id,
          message: `Consecutive scenes ${prev.id} and ${s.id} share identical layout description.`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    storyboard: sb,
  };
}

export function generateStoryboardMarkdown(sb: StoryboardData, issues: ValidationIssue[] = []): string {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  let md = `# Storyboard Review: ${sb.video.id}\n\n`;
  if (sb.video.title) {
    md += `**Title:** ${sb.video.title}  \n`;
  }
  md += `**Scenes Count:** ${sb.scenes.length}  \n`;
  md += `**Validation Status:** ${errors.length === 0 ? "✅ PASSED" : `❌ FAILED (${errors.length} errors)`}\n\n`;

  if (sb.videoArc?.summary) {
    md += `## Video Arc\n${sb.videoArc.summary}\n\n`;
  }

  if (errors.length > 0) {
    md += `## ❌ Required Fixes\n`;
    for (const err of errors) {
      md += `- **[${err.sceneId ?? "GLOBAL"}]** ${err.message}\n`;
    }
    md += `\n`;
  }

  if (warnings.length > 0) {
    md += `## ⚠️ Warnings\n`;
    for (const w of warnings) {
      md += `- **[${w.sceneId ?? "GLOBAL"}]** ${w.message}\n`;
    }
    md += `\n`;
  }

  md += `## Scene Flow Matrix\n\n`;
  md += `| Scene | Time (s) | Visual Metaphor & Hero Moment | Anchor Beats | Data & SFX |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const s of sb.scenes) {
    const tStart = (s.startMs / 1000).toFixed(2);
    const tEnd = (s.endMs / 1000).toFixed(2);
    const dur = ((s.endMs - s.startMs) / 1000).toFixed(1);

    const beatsStr = s.beats.map((b) => `• "${b.anchor}" (${b.offsetMs}ms): ${b.action}`).join("<br/>");
    const dataStr = s.data.map((d) => `📊 **${d.value}** (${d.label}) [_${d.source}_]`).join("<br/>");
    const sfxStr = s.sfx.map((c) => `🔊 _${c.sound}_ on "${c.anchor}"`).join("<br/>");

    md += `| **${s.id}**<br/>\`${s.slug}\` | ${tStart}s – ${tEnd}s<br/>_(${dur}s)_ | **Metaphor:** ${s.metaphor}<br/><br/>**Hero:** ${s.hero} | ${beatsStr || "_None_"} | ${[dataStr, sfxStr].filter(Boolean).join("<br/>") || "_None_"} |\n`;
  }

  return md;
}
