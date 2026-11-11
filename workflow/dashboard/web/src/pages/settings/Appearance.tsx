import { Check, Moon, Sun } from "lucide-react";
import { Card, CardBody, CardHeader, CardSub, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/layout";
import { usePalette } from "@/hooks/usePalette";
import { useTheme } from "@/hooks/useTheme";
import { CHANNEL, PALETTES } from "@/theme/channel";
import { cn } from "@/lib/utils";

/** Palette and light/dark for this browser. The channel's default palette lives in theme/channel.ts. */
export function Appearance() {
  const [palette, setPalette] = usePalette();
  const [theme, toggle] = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardSub>this browser only · the channel default is set in web/src/theme/channel.ts</CardSub>
        <span className="flex-1" />
        <Segmented label="Light or dark" value={theme} onChange={(v) => v !== theme && toggle()} className="h-7"
          options={[{ value: "light", label: "Light", icon: <Sun /> }, { value: "dark", label: "Dark", icon: <Moon /> }]} />
      </CardHeader>
      <CardBody>
        <div role="radiogroup" aria-label="Palette" className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
          {PALETTES.map((p) => {
            const on = p.id === palette.id;
            return (
              <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setPalette(p.id)}
                className={cn("group grid gap-2.5 rounded-lg border bg-raised p-3 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/60",
                  on ? "border-brand shadow-sm" : "hover:border-border-strong")}>
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  {p.label}
                  {p.id === CHANNEL.palette && <span className="text-[11px] font-normal text-subtle-foreground">channel</span>}
                  {on && <Check className="ml-auto size-3.5 text-brand" />}
                </span>
                <span className="flex h-6 overflow-hidden rounded-md ring-1 ring-inset ring-border">
                  {[p.brand, p.positive, p.negative, p.info, p.paper].map((c, i) => <span key={i} className={i === 0 ? "flex-[2]" : "flex-1"} style={{ background: c }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
