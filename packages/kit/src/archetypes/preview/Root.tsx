import React from "react";
import { Composition, registerRoot } from "remotion";
import { SceneProvider, type SpokenWord } from "../../scene";
import { Backdrop } from "../../main/Backdrop";
import { ensureFontsLoaded } from "../../fonts";
import { ArchetypeScene, listArchetypes } from "../registry";
import "../index";

/**
 * Preview harness: one composition per archetype example, e.g. "WorldMap-0".
 * Narration words are given synthetic, evenly paced timings (2.6 words/s after a
 * 0.5 s lead) so cues resolve the same way they will against real voiceover.
 *
 *   bunx remotion still packages/kit/src/archetypes/preview/Root.tsx WorldMap-0 out.png --frame 120
 */

const FPS = 30;
const LEAD_SEC = 0.5;
const WORDS_PER_SEC = 2.6;
const TAIL_SEC = 1.2;

function synthWords(narration: string): SpokenWord[] {
  const perWord = FPS / WORDS_PER_SEC;
  return narration
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => {
      const startFrame = Math.round(LEAD_SEC * FPS + i * perWord);
      return { text, startFrame, endFrame: Math.round(startFrame + perWord * 0.85) };
    });
}

const PreviewRoot: React.FC = () => {
  ensureFontsLoaded();
  return (
    <>
      {listArchetypes().flatMap((def) =>
        def.examples.map((ex, i) => {
          const words = synthWords(ex.narration);
          const voiceEnd = words.length ? words[words.length - 1].endFrame : FPS;
          const durationFrames = voiceEnd + Math.round(TAIL_SEC * FPS);
          const spec = { archetype: def.name, props: ex.props };
          return (
            <Composition
              key={`${def.name}-${i}`}
              id={`${def.name}-${i}`}
              durationInFrames={durationFrames}
              fps={FPS}
              width={1920}
              height={1080}
              component={() => (
                <SceneProvider
                  value={{
                    id: `${def.name}-${i}`,
                    fps: FPS,
                    width: 1920,
                    height: 1080,
                    durationFrames,
                    leadFrames: Math.round(LEAD_SEC * FPS),
                    voiceStart: words[0]?.startFrame,
                    voiceEnd,
                    words,
                  }}
                >
                  <Backdrop />
                  <ArchetypeScene spec={spec} />
                </SceneProvider>
              )}
            />
          );
        })
      )}
    </>
  );
};

registerRoot(PreviewRoot);
