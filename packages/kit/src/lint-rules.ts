/**
 * Static Analysis Lint Rules for @wealthgap/kit Scene Files
 * Enforces determinism, token usage, correct imports, and scene conventions.
 */

export interface LintIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  line?: number;
  snippet?: string;
}

export interface LintResult {
  valid: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

export const ALLOWED_SFX = [
  "whoosh",
  "whip",
  "switch",
  "ding",
  "mouse-click",
  "page-turn",
  "pop",
  "click",
  "impact",
  "chime",
  "drop",
  "rumble",
  "sweep",
  "transition",
];

export const ALLOWED_IMPORT_PACKAGES = [
  "@wealthgap/kit",
  "remotion",
  "react",
  "react/jsx-runtime",
];

export function lintSceneCode(code: string, filename: string = "S01_scene.tsx", wordsInScene: string[] = []): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const lines = code.split("\n");

  const expectedIdMatch = filename.match(/^(S\d+)/i);
  const expectedId = expectedIdMatch ? expectedIdMatch[1].toUpperCase() : null;

  // 1. Check exports
  const hasDefaultExport = /export\s+default\s+(function|class|[A-Za-z0-9_]+)/.test(code);
  if (!hasDefaultExport) {
    errors.push({
      severity: "error",
      code: "MISSING_DEFAULT_EXPORT",
      message: "Scene file must have a default export component.",
    });
  }

  const hasMetaExport = /export\s+const\s+meta\s*=/.test(code);
  if (!hasMetaExport) {
    errors.push({
      severity: "error",
      code: "MISSING_META_EXPORT",
      message: "Scene file must have a named 'meta' export: export const meta = { id, title, numbers, sfx }.",
    });
  } else {
    // Check meta.id matches filename
    const idMatch = code.match(/id:\s*["']([^"']+)["']/);
    if (idMatch && expectedId && idMatch[1].toUpperCase() !== expectedId) {
      errors.push({
        severity: "error",
        code: "META_ID_MISMATCH",
        message: `meta.id "${idMatch[1]}" does not match file ID prefix "${expectedId}".`,
      });
    }
  }

  // 2. Check Hooks usage. Briefing acts draw through SpyCanvas/drawAct with ctx.t instead of Remotion hooks.
  const canvasAct = /\b(SpyCanvas|drawAct)\b/.test(code);
  if (!canvasAct && !code.includes("useCurrentFrame")) {
    errors.push({
      severity: "error",
      code: "MISSING_USE_CURRENT_FRAME",
      message: "Scene component must be frame-driven: use useCurrentFrame() (or SpyCanvas/drawAct with ctx.t).",
    });
  }
  if (!canvasAct && !code.includes("useScene")) {
    errors.push({
      severity: "error",
      code: "MISSING_USE_SCENE",
      message: "Scene component must use useScene() to access scene timing, words, and dimensions (not needed with SpyCanvas/drawAct).",
    });
  }

  // 3. Line-by-line checks
  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;
    const trimmed = lineText.trim();

    // Skip comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      return;
    }

    // 3a. Banned Imports
    const importMatch = lineText.match(/import\s+.*?from\s+["']([^"']+)["']/);
    if (importMatch) {
      const imp = importMatch[1];
      const isAllowed =
        ALLOWED_IMPORT_PACKAGES.includes(imp) ||
        ALLOWED_IMPORT_PACKAGES.some((pkg) => imp.startsWith(`${pkg}/`));

      if (!isAllowed) {
        errors.push({
          severity: "error",
          code: "BANNED_IMPORT",
          message: `Forbidden import from "${imp}". Scenes may only import from @wealthgap/kit, remotion, and react.`,
          line: lineNum,
          snippet: trimmed,
        });
      }
    }

    // 3b. Non-deterministic functions & browser globals
    if (/\bMath\.random\s*\(/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_RANDOM",
        message: "Math.random() is forbidden in scenes. Use seeded(seed) from @wealthgap/kit for deterministic animation.",
        line: lineNum,
        snippet: trimmed,
      });
    }
    if (/\bDate\.now\s*\(/.test(lineText) || /\bnew\s+Date\s*\(/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_DATE",
        message: "Date usage is forbidden in scenes. Drive animation strictly via useCurrentFrame().",
        line: lineNum,
        snippet: trimmed,
      });
    }
    if (/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_TIMER",
        message: "Timers and animation frames are forbidden. Drive animation strictly via useCurrentFrame().",
        line: lineNum,
        snippet: trimmed,
      });
    }
    if (/\bfetch\s*\(/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_NETWORK",
        message: "Network calls (fetch) are forbidden inside scenes. Data must be static or passed via props.",
        line: lineNum,
        snippet: trimmed,
      });
    }

    // 3c. CSS Transitions / Animations
    if (/(\btransition\s*:|\banimation\s*:|@keyframes)/i.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_CSS_ANIMATION",
        message: "CSS transitions, animations, and @keyframes are forbidden. Use interpolate(), keys(), or spring().",
        line: lineNum,
        snippet: trimmed,
      });
    }
    if (/(animate-|transition-)/.test(lineText) && /className\s*=/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "BANNED_TAILWIND_ANIMATION",
        message: "CSS animation utility classes are forbidden.",
        line: lineNum,
        snippet: trimmed,
      });
    }

    // 3d. Raw Hex Colors in scenes
    // Disallow `#123456` or `#fff` unless part of a comment
    const hexMatch = lineText.match(/#([0-9a-fA-F]{3,8})\b/);
    if (hexMatch) {
      errors.push({
        severity: "error",
        code: "RAW_HEX_COLOR",
        message: `Raw hex color "${hexMatch[0]}" forbidden. Use tokens.color.* or kit token names.`,
        line: lineNum,
        snippet: trimmed,
      });
    }

    // 3e. Raw fontFamily string literals
    if (/fontFamily\s*:\s*["'][^"']+["']/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "RAW_FONT_FAMILY",
        message: "Hard-coded fontFamily string forbidden. Use tokens.font.* or FONTS.*.",
        line: lineNum,
        snippet: trimmed,
      });
    }

    // 3f. Opaque background on AbsoluteFill
    if (/<AbsoluteFill[^>]*style\s*=\s*\{[^}]*backgroundColor\s*:\s*["'][^"']+["'][^}]*\}/.test(lineText)) {
      errors.push({
        severity: "error",
        code: "OPAQUE_BACKGROUND",
        message: "Scene must not paint an opaque full-screen background. Allow global <Backdrop /> to show through.",
        line: lineNum,
        snippet: trimmed,
      });
    }

    // 3g. SFX Name Validation
    const sfxSoundMatch = lineText.match(/sound\s*:\s*["']([^"']+)["']/);
    if (sfxSoundMatch) {
      const soundName = sfxSoundMatch[1].toLowerCase();
      if (!ALLOWED_SFX.includes(soundName)) {
        errors.push({
          severity: "error",
          code: "INVALID_SFX_NAME",
          message: `SFX sound "${soundName}" is not in the allowed sound set (${ALLOWED_SFX.join(", ")}).`,
          line: lineNum,
          snippet: trimmed,
        });
      }
    }

    // 3h. Word Anchor Validation
    const wordCallMatch = lineText.match(/s\.word\s*\(\s*["']([^"']+)["']/g);
    if (wordCallMatch && wordsInScene.length > 0) {
      wordCallMatch.forEach((call) => {
        const word = call.replace(/^s\.word\s*\(\s*["']/, "").replace(/["'].*$/, "").toLowerCase();
        const exists = wordsInScene.some(
          (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "") === word.replace(/[^a-z0-9]/g, "")
        );
        if (!exists) {
          warnings.push({
            severity: "warning",
            code: "UNKNOWN_WORD_ANCHOR",
            message: `Anchor word "${word}" was not found in this scene's spoken transcript.`,
            line: lineNum,
            snippet: trimmed,
          });
        }
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
