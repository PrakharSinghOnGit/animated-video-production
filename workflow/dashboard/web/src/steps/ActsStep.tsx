import { useApp } from "@/hooks/app";
import { dur, money, cn } from "@/lib/utils";
import { ActionCard } from "@/components/ActionCard";
import { ActionGrid } from "@/components/Layout";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/Status";
import { ActDetail } from "./ActDetail";

export function ActsStep() {
  const { d, route, go } = useApp();
  if (!d) return null;
  const acts = d.acts;
  const a = acts.find((x) => x.id === route.act) ?? acts[0];
  return (
    <>
      <ActionGrid><ActionCard id="acts.all" /></ActionGrid>
      {acts.length === 0 ? <div className="text-xs text-muted-foreground">Plan the video first.</div> : (
        <div className="grid items-start gap-3.5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Acts</CardTitle></CardHeader>
            <div className="flex max-h-72 flex-col overflow-auto lg:max-h-[640px]">
              {acts.map((x) => {
                const rv = x.reviews[0];
                return (
                  <button key={x.id} onClick={() => go({ act: x.id })} aria-current={x.id === a?.id}
                    className={cn("grid min-h-12 grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b px-3 py-2 text-left hover:bg-accent", x.id === a?.id && "bg-accent shadow-[inset_2px_0_0_var(--brand)]")}>
                    <StatusDot s={x.status} />
                    <span className="min-w-0">
                      <span className="block truncate"><span className="font-mono">{x.id}</span> {x.title}</span>
                      <span className="text-[11px] text-muted-foreground">{((x.end - x.start) / 1000).toFixed(0)} s{x.meta ? ` · ${dur(x.meta.totalMs)} · ${money(x.meta.totalCost)}` : ""}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{rv ? `sync ${rv.sync}/10` : x.critic ? `critic ${x.critic.score}/10` : ""}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          {a && <ActDetail key={a.id} a={a} />}
        </div>
      )}
    </>
  );
}
