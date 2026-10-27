import { useApp } from "@/hooks/app";
import { Flow } from "@/components/Flow";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";

export function SoundStep() {
  const { d } = useApp();
  if (!d) return null;
  const s = d.sound;
  const has = (n: string) => s.files.find((f) => f.path.endsWith(n));
  const music = has("music.wav"), mix = has("mix.wav");
  return (
    <Flow blocks={[
      { id: "cues", title: "Cues", action: "sound.cues", label: "Cues", done: s.events != null, costRe: /^cues\b/i, children: s.events != null ? <div className="text-xs text-muted-foreground">{s.events} foley events</div> : undefined },
      { id: "music", title: "Music stem", action: "sound.music", label: "Music stem", done: !!music, outAt: music?.mtime, costRe: /^music\b/i,
        children: <>{music && <MediaPlayer f={music} kind="audio" label="06-audio/music.wav" />}{s.stems.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" label={f.path.replace("06-audio/", "")} />)}</> },
      { id: "mix", title: "Mix", action: "sound.mix", label: "Mix", done: !!mix, outAt: mix?.mtime, costRe: /^mix\b/i,
        children: <>{mix && <MediaPlayer f={mix} kind="audio" label="06-audio/mix.wav" />}{s.credits && <div><div className="mb-1 text-xs font-medium">Credits for the description</div><Prose>{s.credits}</Prose></div>}</> },
    ]} />
  );
}
