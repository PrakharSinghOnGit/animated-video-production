import { z } from "zod";
import { useCurrentFrame } from "remotion";
import { useScene } from "../scene";
import { ease, p } from "../motion";

/**
 * Cues tie archetype beats to the narration.
 *
 * A cue is either a spoken word from the scene ("crash", or "crash#2" for the
 * second occurrence) or a number of seconds after the scene's voice starts.
 * Storyboards write cues; archetypes resolve them to frames with useCue().
 */
export const CueSchema = z.union([
  z.string().min(1).describe('Spoken anchor word, e.g. "crash" or "crash#2" for the 2nd occurrence'),
  z.number().min(0).describe("Seconds after the scene's voice starts"),
]);
export type Cue = z.infer<typeof CueSchema>;

export function parseCue(cue: string): { word: string; occurrence: number } {
  const [word, occ] = cue.split("#");
  return { word: word.trim(), occurrence: occ ? Math.max(1, parseInt(occ, 10) || 1) : 1 };
}

/** Frame at which a cue happens (word start, or voiceStart + seconds), shifted by offsetSec. */
export function useCue(cue: Cue | undefined, offsetSec: number = 0): number {
  const s = useScene();
  let frame: number;
  if (cue === undefined) {
    frame = s.voiceStart;
  } else if (typeof cue === "number") {
    frame = s.voiceStart + s.sec(cue);
  } else {
    const { word, occurrence } = parseCue(cue);
    frame = s.word(word, occurrence).start;
  }
  return frame + s.sec(offsetSec);
}

/** 0→1 progress of a beat that starts at a cue and lasts durationSec. */
export function useBeat(
  cue: Cue | undefined,
  durationSec: number = 0.6,
  easing: (t: number) => number = ease.outExpo,
  offsetSec: number = -0.08
): number {
  const frame = useCurrentFrame();
  const s = useScene();
  const start = useCue(cue, offsetSec);
  return easing(p(frame, start, start + Math.max(1, s.sec(durationSec))));
}

/**
 * Shared scene lifecycle so every archetype enters, breathes and exits the same way.
 * enter: 0→1 around the first spoken word; exit: 0→1 over the last 0.35 s of the window;
 * push: slow camera push-in across the whole scene (1 → 1.035).
 */
export function useLifecycle(): { enter: number; exit: number; push: number; visible: number } {
  const frame = useCurrentFrame();
  const s = useScene();
  const enter = ease.outExpo(p(frame, s.voiceStart - s.sec(0.35), s.voiceStart + s.sec(0.45)));
  const exit = ease.inCubic(p(frame, s.durationFrames - s.sec(0.35), s.durationFrames));
  const push = 1 + 0.035 * ease.inOutSine(p(frame, 0, s.durationFrames));
  return { enter, exit, push, visible: enter * (1 - exit) };
}
