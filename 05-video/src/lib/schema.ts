import { z } from "zod";

// ========================================================
// 1. Brief Schema (validates brief.md YAML front-matter)
// ========================================================
export const BriefMustShowItemSchema = z.object({
  value: z.string(),
  label: z.string(),
  source: z.string(),
  year: z.number().optional(),
});

export const BriefFrontMatterSchema = z.object({
  title: z.string().min(1, "Title is required"),
  topic: z.string().min(1, "Topic is required"),
  language: z.string().default("en"),
  audience: z.string().default("finance / economics curious"),
  tone: z.string().default("calm, authoritative, a little dramatic"),
  aspect: z.enum(["16:9", "9:16"]).default("16:9"),
  accent: z.string().default("#F5B83D"),
  must_show: z.array(BriefMustShowItemSchema).default([]),
  avoid: z.array(z.string()).default([]),
  chapters: z.array(z.string()).optional(),
  outputs: z.array(z.string()).default(["video", "captions", "chapters", "thumbnails", "metadata"]),
});

export type BriefFrontMatter = z.infer<typeof BriefFrontMatterSchema>;

// ========================================================
// 2. Config Schema (config.json overrides)
// ========================================================
export const CaptionsConfigSchema = z.object({
  mode: z.enum(["burned", "sidecar", "both"]).default("sidecar"),
  style: z.enum(["clean-bottom", "pop-center", "line-minimal"]).default("clean-bottom"),
  wordsPerPage: z.number().default(5),
});

export const MusicConfigSchema = z.object({
  file: z.string().nullable().default(null),
  volume: z.number().default(0.08),
  duckTo: z.number().default(0.03),
});

export const SfxConfigSchema = z.object({
  enabled: z.boolean().default(true),
  volume: z.number().default(0.25),
  set: z.array(z.string()).default(["whoosh", "whip", "switch", "ding", "mouse-click", "page-turn"]),
});

export const RenderProfileSchema = z.object({
  scale: z.number().optional(),
  crf: z.number().default(16),
  codec: z.enum(["h264", "h265", "prores"]).default("h264"),
});

export const ConfigSchema = z.object({
  fps: z.number().default(30),
  width: z.number().default(1920),
  height: z.number().default(1080),
  aspects: z.array(z.enum(["16:9", "9:16"])).default(["16:9"]),
  audioOffsetMs: z.number().default(0),
  tailPaddingMs: z.number().default(1200),
  captions: CaptionsConfigSchema.default({
    mode: "sidecar",
    style: "clean-bottom",
    wordsPerPage: 5,
  }),
  music: MusicConfigSchema.default({
    file: null,
    volume: 0.08,
    duckTo: 0.03,
  }),
  sfx: SfxConfigSchema.default({
    enabled: true,
    volume: 0.25,
    set: ["whoosh", "whip", "switch", "ding", "mouse-click", "page-turn"],
  }),
  render: z.object({
    draft: RenderProfileSchema.default({ scale: 0.5, crf: 28, codec: "h264" }),
    final: RenderProfileSchema.default({ scale: 1.0, crf: 16, codec: "h264" }),
  }).default({
    draft: { scale: 0.5, crf: 28, codec: "h264" },
    final: { scale: 1.0, crf: 16, codec: "h264" },
  }),
  qc: z.object({
    failOnWarnings: z.boolean().default(false),
  }).default({
    failOnWarnings: false,
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// ========================================================
// 3. Caption Schema (Remotion Caption compatible)
// ========================================================
export const CaptionTokenSchema = z.object({
  text: z.string(), // Must preserve leading space convention
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
  pageBreakAfter: z.boolean().optional(),
});

export const CaptionsListSchema = z.array(CaptionTokenSchema);
export type NormalizedCaption = z.infer<typeof CaptionTokenSchema>;

// ========================================================
// 4. Beats Schema (output of analyze stage)
// ========================================================
export const BeatTokenSchema = z.object({
  type: z.enum(["word", "number", "currency", "pause", "sentence_break"]),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  value: z.number().optional(),
  unit: z.string().optional(),
});

export const BeatSentenceSchema = z.object({
  index: z.number(),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  durationMs: z.number(),
  wordCount: z.number(),
  numbers: z.array(z.string()),
  pauseAfterMs: z.number(),
});

export const BeatsFileSchema = z.object({
  jobId: z.string(),
  totalDurationMs: z.number(),
  totalWords: z.number(),
  sentences: z.array(BeatSentenceSchema),
  pauses: z.array(z.object({
    afterWordIndex: z.number(),
    startMs: z.number(),
    endMs: z.number(),
    durationMs: z.number(),
  })),
  numbers: z.array(z.object({
    raw: z.string(),
    value: z.number().optional(),
    startMs: z.number(),
    endMs: z.number(),
    sentenceIndex: z.number(),
  })),
  suggestedSceneBreaks: z.array(z.object({
    sceneId: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    reason: z.string(),
    sentenceIndices: z.array(z.number()),
  })),
});

export type BeatsFile = z.infer<typeof BeatsFileSchema>;

// ========================================================
// 5. Scenes Schema (storyboard scenes.json)
// ========================================================
export const AnchorActionSchema = z.object({
  word: z.string(),
  occurrence: z.number().default(1),
  action: z.string(), // e.g. "countUp.end", "barGrow.start"
  offsetFrames: z.number().default(-8), // lead audio by 6-10 frames
});

export const ForegroundElementSchema = z.object({
  component: z.string(),
  props: z.record(z.string(), z.any()),
  enterAtMs: z.number().optional(),
  exitAtMs: z.number().optional(),
  anchors: z.array(AnchorActionSchema).optional(),
});

export const SceneSchema = z.object({
  id: z.string(),
  chapter: z.string().optional(),
  startMs: z.number(),
  endMs: z.number(),
  voLine: z.string(),
  intent: z.string().optional(),
  visualMetaphor: z.string().optional(),
  layers: z.object({
    background: z.object({
      component: z.string().default("GridDrift"),
      props: z.record(z.string(), z.any()).default({}),
    }).default({ component: "GridDrift", props: {} }),
    midground: z.object({
      component: z.string().default("GlowBlobs"),
      props: z.record(z.string(), z.any()).default({}),
    }).optional(),
    foreground: z.array(ForegroundElementSchema),
  }),
  annotation: z.object({
    type: z.enum(["highlight", "circle", "underline", "box", "bracket", "strike"]),
    target: z.string(),
    atWord: z.string().optional(),
  }).optional(),
  sourceTag: z.object({
    text: z.string(),
    dataRef: z.string().optional(),
  }).optional(),
  transitionOut: z.object({
    type: z.enum(["wipe", "slide", "fade", "zoom", "none"]).default("wipe"),
    durationFrames: z.number().default(10),
  }).optional(),
  sfx: z.array(z.object({
    at: z.string(), // "scene.start" | "anchor:<word>" | number ms
    sound: z.string(),
    volume: z.number().default(0.25),
  })).optional(),
});

export const ScenesFileSchema = z.object({
  jobId: z.string(),
  fps: z.number().default(30),
  totalDurationMs: z.number().optional(),
  scenes: z.array(SceneSchema),
});

export type Scene = z.infer<typeof SceneSchema>;
export type ScenesFile = z.infer<typeof ScenesFileSchema>;

// ========================================================
// 6. Metadata Schema (final output metadata.json)
// ========================================================
export const MetadataSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  jobId: z.string(),
  title: z.string(),
  topic: z.string(),
  language: z.string().default("en"),
  createdAt: z.string(),
  inputsHash: z.string(),
  video: z.object({
    file: z.string(),
    durationSec: z.number(),
    fps: z.number(),
    width: z.number(),
    height: z.number(),
    codec: z.string(),
    sizeBytes: z.number(),
  }),
  audio: z.object({
    integratedLUFS: z.number().optional(),
    truePeakDBTP: z.number().optional(),
    hasMusic: z.boolean(),
    sfxCount: z.number(),
  }),
  captions: z.object({
    mode: z.string(),
    files: z.array(z.string()),
    wordCount: z.number(),
  }),
  chapters: z.array(z.object({
    time: z.string(),
    title: z.string(),
  })),
  scenes: z.array(z.object({
    id: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    components: z.array(z.string()),
    chapter: z.string().optional(),
  })),
  numbersShown: z.array(z.object({
    scene: z.string(),
    value: z.string(),
    source: z.string(),
    dataRef: z.string().optional(),
  })),
  fonts: z.array(z.string()),
  thumbnails: z.array(z.string()),
  qc: z.object({
    errors: z.number(),
    warnings: z.number(),
    needsData: z.array(z.string()),
  }),
  render: z.object({
    seconds: z.number(),
    profile: z.string(),
    remotion: z.string(),
    node: z.string(),
    ffmpeg: z.string(),
  }),
  suggestedMetadata: z.object({
    titleOptions: z.array(z.string()),
    descriptionFile: z.string(),
    tags: z.array(z.string()).optional(),
  }),
});

export type Metadata = z.infer<typeof MetadataSchema>;
