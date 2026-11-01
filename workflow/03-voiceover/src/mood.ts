/**
 * A section's tone note (rawInstruction, written by the script writer, e.g. "Suspenseful", "dry, light irony")
 * -> one of the channel voice's mood clips (voices/<name>/emotions/<mood>.wav, bun run voice:emotions).
 * neutral = the main reference. First matching mood wins, in this order.
 */
export const MOODS = ["suspense", "wry", "excited", "serious"] as const;
export type Mood = (typeof MOODS)[number] | "neutral";

const RULES: [Exclude<Mood, "neutral">, RegExp][] = [
  ["suspense", /suspens|tension|tense|ominous|myster|hush|whisper|dark|eerie|thriller|foreboding|dramatic/i],
  ["wry", /sarcas|iron|wry|knowing|\bdry|tongue|playful|cheeky|mock|deadpan|smirk|teasing/i],
  ["excited", /excit|upbeat|energ|enthusias|surpris|amaz|bright|punchy|hype|thrill|wow|lively|animated|urgent|urgency|fast|building speed/i],
  ["serious", /serious|caution|grave|somber|sombre|warn|sober|solemn|stern|heavy|slow|lower|measured|methodical|analytic|matter-of-fact|calm|firm|careful|honest|cautious/i],
];

export function moodFor(instruction: string | undefined): Mood {
  const s = (instruction ?? "").replace(/^.*?VO:\s*/i, "");
  for (const [mood, re] of RULES) if (re.test(s)) return mood;
  return "neutral";
}
