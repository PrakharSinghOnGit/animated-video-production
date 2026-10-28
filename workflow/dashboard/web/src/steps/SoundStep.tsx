import { useApp } from "@/hooks/app";
import { Flow, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";

export function SoundStep() {
  const { d } = useApp();
  if (!d) return null;
  const s = d.sound;
  const has = (n: string) => s.files.find((f) => f.path.endsWith(n));
  const music = has("music.wav"), mix = has("mix.wav"), dawMix = has("mix_daw.wav");
  const spec = stepSpec("sound", d);
  const kids: Record<string, React.ReactNode> = {
    cues: s.events != null ? <div className="text-xs text-muted-foreground">{s.events} foley events</div> : undefined,
    music: <>{music && <MediaPlayer f={music} kind="audio" label="06-audio/music.wav" />}{s.stems.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" label={f.path.replace("06-audio/", "")} />)}</>,
    mix: <>{mix && <MediaPlayer f={mix} kind="audio" label="06-audio/mix.wav" />}{s.credits && <div><div className="mb-1 text-xs font-medium">Credits for the description</div><Prose>{s.credits}</Prose></div>}</>,
  };
  const b = s.daw.build;
  kids.daw = b ? <div className="text-xs text-muted-foreground">{b.regions} clips on {b.tracks.length} tracks, {(b.bytes / 1e6).toFixed(0)} MB. Rebuilding replaces the project.</div> : undefined;
  kids.edited = dawMix ? (
    <>
      <MediaPlayer f={dawMix} kind="audio" label="06-audio/mix_daw.wav" />
      <div className="text-xs text-muted-foreground">{s.daw.autoMix && s.daw.autoMix.mtime > dawMix.mtime ? "mix.wav is newer, so the next render uses the auto mix. Export again from openDAW (or delete mix_daw.wav) to choose." : "The next render uses this instead of mix.wav. Delete mix_daw.wav to go back to the auto mix."}</div>
    </>
  ) : undefined;
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
