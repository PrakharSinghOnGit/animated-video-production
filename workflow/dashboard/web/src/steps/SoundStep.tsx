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
  const music = has("music.wav"), mix = has("mix.wav");
  const spec = stepSpec("sound", d);
  const kids: Record<string, React.ReactNode> = {
    cues: s.events != null ? <div className="text-xs text-muted-foreground">{s.events} foley events</div> : undefined,
    music: <>{music && <MediaPlayer f={music} kind="audio" label="06-audio/music.wav" />}{s.stems.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" label={f.path.replace("06-audio/", "")} />)}</>,
    mix: <>{mix && <MediaPlayer f={mix} kind="audio" label="06-audio/mix.wav" />}{s.credits && <div><div className="mb-1 text-xs font-medium">Credits for the description</div><Prose>{s.credits}</Prose></div>}</>,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
