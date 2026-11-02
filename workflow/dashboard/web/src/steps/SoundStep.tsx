import { useApp } from "@/hooks/app";
import { Flow, BlockFold, withKids } from "@/components/Flow";
import { stepSpec } from "@/lib/pipeline";
import { MediaPlayer } from "@/components/MediaPlayer";
import { Prose } from "@/components/FileLine";
import { DataTable, Td } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { SfxReview } from "@/components/SfxReview";

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function SoundStep() {
  const { d } = useApp();
  if (!d) return null;
  const s = d.sound;
  const has = (n: string) => s.files.find((f) => f.path.endsWith(n));
  const music = has("music.wav"), mix = has("mix.wav");
  const spec = stepSpec("sound", d);
  const kids: Record<string, React.ReactNode> = {
    cues: s.events != null ? (
      <>
        <div className="text-xs text-muted-foreground">{s.events} foley events from the acts' code, {s.eventTypes.length} different sounds</div>
        <div className="flex flex-wrap gap-1.5">{s.eventTypes.map(([k, n]) => <Badge key={k}>{k.replace(/_/g, " ")} ×{n}</Badge>)}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-subtle-foreground">{s.eventActs.map(([a, n]) => <span key={a}><span className="font-mono">{a}</span> {n}</span>)}</div>
      </>) : undefined,
    foley: <SfxReview />,
    music: (
      <>
        {s.music && (
          <DataTable head={[{ label: "Act" }, { label: "Time" }, { label: "Source" }, { label: "BPM", right: true }, { label: "Key" }, { label: "Energy", right: true }]}>
            {s.music.sections.map((x) => (
              <tr key={x.label + x.t0}><Td className="font-mono">{x.label}</Td><Td className="whitespace-nowrap font-mono">{t(x.t0)}–{t(x.t1)}{x.intro ? ` · ${x.intro}` : ""}</Td>
                <Td>{x.source}</Td><Td right>{x.bpm ?? ""}</Td><Td>{x.key ?? ""}</Td><Td right>{x.intensity ?? ""}</Td></tr>
            ))}
          </DataTable>
        )}
        {s.music && <div className="text-[11px] text-subtle-foreground">{s.music.crossfadeSec ? `${s.music.crossfadeSec} s crossfade between sections · ` : ""}edit 06-audio/music.json to pick other tracks</div>}
        {music && <MediaPlayer f={music} kind="audio" label="06-audio/music.wav" />}
        {s.stems.length > 0 && <BlockFold title={`${s.stems.length} stems and auditions`}><div className="grid gap-2 pb-2">{s.stems.map((f) => <MediaPlayer key={f.path} f={f} kind="audio" label={f.path.replace("06-audio/", "")} />)}</div></BlockFold>}
      </>),
    mix: <>{mix && <MediaPlayer f={mix} kind="audio" label="06-audio/mix.wav" />}{s.credits && <div><div className="mb-1 text-xs font-medium">Credits for the description</div><Prose>{s.credits}</Prose></div>}</>,
  };
  return <Flow loops={spec.loops} blocks={withKids(spec.blocks, kids)} />;
}
